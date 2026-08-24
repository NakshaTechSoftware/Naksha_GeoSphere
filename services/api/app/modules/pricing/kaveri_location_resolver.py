"""Generic, dynamic resolution of a KGIS cadastral location to Kaveri's own
District → Taluk → Hobli → Village hierarchy.

This module is the single source of truth for "given a clicked parcel's
KGIS district/taluk/hobli/village (and optionally its KGIS village code),
what are the corresponding Kaveri internal codes?".

Design principles (per the task spec):
- NO hardcoded aliases. There is deliberately no lookup like
  {"Dakshina Kannada": "Mangalore"} or {"Belthangady": "Beltangadi"}. Matching
  is entirely data-driven against the live Kaveri hierarchy.
- Case-insensitive key extraction. Kaveri's real responses use camelCase
  (`districtCode`, `talukNamee`, `hoblicode`, `villagecode`, ...) inconsistent
  between endpoints, so every value is pulled by a case-insensitive key scan.
- Generic fuzzy matching. Each level is matched by normalized name (and, where
  a Bhoomi cross-code exists, by that code) using `difflib` similarity, then
  the weakest link's score becomes the overall confidence — so a shaky ancestor
  can never promote a confident village match to "confirmed".
- Reused everywhere. The live endpoint (`app/api/v1/pricing.py`) calls
  `resolve_kaveri_location`, while the bulk generator
  (`scripts/generate_kaveri_village_mapping.py`) calls `resolve_in_hierarchy`
  against its locally-cached tree — both go through the same `match_level` /
  `_resolve_from_lists` core, so the two can never drift.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from app.modules.pricing.kaveri_client import KaveriSession

logger = logging.getLogger(__name__)

# --- Generic, conservative transliteration collapse ----------------------
# A small set of Kannada sound variants that commonly appear in two spellings
# across KGIS/Kaveri/Bhoomi sources, collapsed before comparison. This is
# generic normalization, NOT a hardcoded name alias: it never maps a specific
# village/district name to another, only normalizes the letters themselves.
_TRANSLITERATION_VARIANTS: tuple[tuple[str, str], ...] = (
    ("v", "w"),
    ("z", "j"),
    ("zh", "j"),
    ("sh", "s"),
    ("ch", "c"),
    ("kh", "k"),
    ("gh", "g"),
    ("ph", "f"),
    ("th", "t"),
    ("dh", "d"),
    ("bh", "b"),
)

# Per-level candidate key sets. All key lookups are case-insensitive, so a key
# written any of these ways (e.g. "hobliCode" vs "hoblicode") matches.
CODE_KEYS_DISTRICT = ("districtCode", "code")
NAME_KEYS_DISTRICT = ("districtNamee", "districtname", "name")
CODE_KEYS_TALUK = ("talukCode", "code")
NAME_KEYS_TALUK = ("talukNamee", "talukname", "name")
CODE_KEYS_HOBLI = ("hobliCode", "code")
NAME_KEYS_HOBLI = ("hoblinamee", "hobliname", "name")
CODE_KEYS_VILLAGE = ("villagecode", "code")
NAME_KEYS_VILLAGE = ("villagenamee", "villagename", "name")

# Where a Bhoomi cross-code exists on a candidate, it lets us match a level by
# code instead of guessing by name. This is what makes "Dakshina Kannada"
# resolve to Kaveri district 24 ("Mangalore") unambiguously — the KGIS village
# code's first two digits are the Bhoomi district code, and Kaveri districts
# carry `bhoomiDistrictCode`. No name alias required.
BHOOMI_KEY_DISTRICT = "bhoomiDistrictCode"
AUTO_CONFIRM_THRESHOLD = 95.0
PENDING_REVIEW_THRESHOLD = 80.0


def status_for_score(score: float) -> str:
    """Maps a final (weakest-link) score to the spec's status bands. Returns
    a plain string; callers convert to `MappingStatus`."""
    if score >= AUTO_CONFIRM_THRESHOLD:
        return "confirmed"
    if score >= PENDING_REVIEW_THRESHOLD:
        return "pending_review"
    return "failed"


def extract_value(obj: Any, keys: tuple[str, ...]) -> str:
    """Case-insensitive, multi-key value extraction from a Kaveri dict.

    Tries each candidate key (case-insensitively) and returns the first
    non-empty string value. If none of the named keys are present, falls back
    to the first string-valued field — Kaveri's exact response shape varies
    between endpoints, and this keeps resolution working even for undocumented
    casing without guessing a single authoritative key.
    """
    if not isinstance(obj, dict):
        return ""
    lower_map = {k.lower(): k for k in obj}
    for key in keys:
        actual = lower_map.get(key.lower())
        if actual is not None and obj[actual] not in (None, ""):
            return str(obj[actual])
    for value in obj.values():
        if isinstance(value, str) and value.strip():
            return value
    return ""


def normalize_name(name: str) -> str:
    """Lowercase, strip accents, collapse punctuation to spaces, drop a
    leading single-letter initial (KGIS often writes "A.Ingalagaov" for what
    Kaveri lists as "Ingalagaon"), then remove spaces and apply the
    transliteration collapse above. Two names that normalize to the same
    string are treated as an exact match."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    # Drop a leading single-letter INITIAL only when it is an abbreviation
    # followed by a dot (e.g. "A." -> "" so "A.Ingalagaov" -> "ingalagaon").
    # A bare leading consonant is a real part of a place name and must be kept
    # ("Basavanapura" must NOT become "asawanapura", which would corrupt every
    # name beginning with a single letter).
    text = re.sub(r"^\s*[a-z]\.\s*", "", text)
    text = re.sub(r"\s+", "", text)
    for variant, canonical in _TRANSLITERATION_VARIANTS:
        text = text.replace(variant, canonical)
    return text


def _partial_ratio(a: str, b: str) -> float:
    """Best similarity of the shorter string against any equal-length window
    of the longer one. Catches abbreviations/transliteration where one name is
    a clipped version of the other (e.g. "ingalagaov" vs "ingalagaon"), which
    plain `SequenceMatcher` on the whole strings under-scores.

    A short name that is a *whole* substring of a longer one (e.g. "malali" is a
    prefix of "malalikoppa") is NOT meaningful evidence of a match — it's just a
    shared syllable/affix — so an exact-window hit is discounted by the length
    gap (shorter/longer). Without this, "Malali" would score 100 against
    "Malalikoppa" and masquerade as a duplicate village."""
    if not a or not b:
        return 0.0
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    s_len, l_len = len(shorter), len(longer)
    if s_len == 0:
        return 0.0
    best = 0.0
    for i in range(0, l_len - s_len + 1):
        window = longer[i : i + s_len]
        ratio = SequenceMatcher(None, shorter, window).ratio()
        if ratio > best:
            best = ratio
    if best >= 0.999:
        # Exact-window hit: the shorter name is fully contained in the longer —
        # weak evidence, scale by how much of the longer name it actually covers.
        best = best * (s_len / l_len)
    return best


def similarity(a: str, b: str) -> float:
    """0-100 similarity between two already-normalized strings. Uses the
    stronger of the whole-string ratio and the partial (best-window) ratio so
    abbreviations and clipped transliterations still score highly."""
    if not a or not b:
        return 0.0
    full = SequenceMatcher(None, a, b).ratio()
    partial = _partial_ratio(a, b)
    return max(full, partial) * 100.0


def compute_bhoomi_district(kgis_village_code: str | None) -> str | None:
    """The KGIS village code's leading two digits are the Bhoomi district
    code, which Kaveri districts expose as `bhoomiDistrictCode`. Returns that
    two-digit string, or None when the code isn't usable."""
    if kgis_village_code and len(kgis_village_code) >= 2 and kgis_village_code[:2].isdigit():
        return kgis_village_code[:2]
    return None


@dataclass
class LevelMatch:
    candidate: dict | None
    score: float
    method: str  # "code" | "name_exact" | "name_fuzzy" | "none"


def match_level(
    query: str,
    candidates: list[dict],
    name_keys: tuple[str, ...],
    *,
    bhoomi_query: str | None = None,
    bhoomi_key: str | None = None,
) -> LevelMatch:
    """Match `query` against `candidates`.

    - If `bhoomi_query`/`bhoomi_key` are given and a candidate's Bhoomi code
      equals it exactly, that wins with score 100 ("code") — the strongest,
      alias-free signal available.
    - Otherwise the best normalized-name match wins: an exact normalized name
      scores 100 ("name_exact"), else the closest fuzzy candidate ("name_fuzzy").
    - Empty candidate list always yields ("none", 0.0).
    """
    if not candidates:
        return LevelMatch(None, 0.0, "none")

    if bhoomi_query is not None and bhoomi_key is not None:
        target = str(bhoomi_query).strip().lower()
        for candidate in candidates:
            value = extract_value(candidate, (bhoomi_key,))
            if value and value.strip().lower() == target:
                return LevelMatch(candidate, 100.0, "code")

    target = normalize_name(query)
    best: LevelMatch = LevelMatch(None, 0.0, "none")
    for candidate in candidates:
        candidate_name = normalize_name(extract_value(candidate, name_keys))
        if target and candidate_name == target:
            return LevelMatch(candidate, 100.0, "name_exact")
        score = similarity(target, candidate_name)
        if score > best.score:
            best = LevelMatch(candidate, score, "name_fuzzy")
    return best


@dataclass
class KaveriResolution:
    kaveri_district_code: str | None
    kaveri_taluk_code: str | None
    kaveri_hobli_code: str | None
    kaveri_village_code: str | None
    confidence: float
    district_score: float
    taluk_score: float
    hobli_score: float
    village_score: float
    village_candidate: dict | None = None
    # Which strategy produced the final (hobli, village) pair. One of:
    #   "nominal_hierarchy"            - every level matched by name in lockstep
    #   "unique_village_within_taluk" - a unique fuzzy village candidate across
    #                                    the whole resolved taluk pinned its hobli
    #   "ambiguous_village_multiple_hoblis" - 2+ strong candidates -> pending_review
    #   "unique_village_in_alternate_taluk" - KGIS hobli is actually a Kaveri taluk
    #   "ambiguous_village_alternate_taluk"
    #   "no_village_candidate"         - nothing strong enough anywhere
    method: str = "none"

    @property
    def matched(self) -> bool:
        return self.kaveri_village_code is not None


# Road-list entries that describe a special pricing category rather than an
# actual named road/locality (apartment blocks, a catch-all "Other Road"
# bucket). These are real Kaveri rows, not junk, but they should never win a
# village-name/locality match ahead of an actual named road unless nothing
# else is available — a bare land parcel is never priced off "Flat/Apartment".
# "flat"/"apartment" are matched as a substring (real entries phrase this
# every which way, e.g. "FLAT\\APARTMENT", "(Flat /Apartment on cent's)");
# "Other Road" is matched only as the *whole* normalized name so an actually
# named road that happens to contain those words (e.g. "Kadur-Bantwala Road
# East") is never mistaken for Kaveri's generic catch-all bucket.
_LOW_SIGNAL_SUBSTRINGS = ("flat", "apartment")
_LOW_SIGNAL_EXACT_NAMES = ("other road",)


def _is_low_signal_road(name: str) -> bool:
    n = name.lower()
    if any(k in n for k in _LOW_SIGNAL_SUBSTRINGS):
        return True
    return n.strip() in _LOW_SIGNAL_EXACT_NAMES

# Road-resolution confidence bands (0-1). A `village_default`/`manual_required`
# result must never be treated as authoritative on its own — see
# `select_road`'s docstring and `app.api.v1.pricing`'s `road_selection_required`
# handling.
ROAD_CONFIDENCE_EXACT_ATTRIBUTE = 0.97
ROAD_CONFIDENCE_SINGLE_CANDIDATE = 0.55
ROAD_CONFIDENCE_LOW_MATCH = 0.35
ROAD_CONFIDENCE_NO_SIGNAL = 0.2


@dataclass
class RoadCandidate:
    code: str
    name: str


@dataclass
class RoadResolution:
    road_code: str | None
    road_name: str | None
    confidence: float
    method: str  # exact_road_attribute | locality_name_match | village_default | manual_required
    ranked: list[RoadCandidate]  # every road Kaveri returned, most-relevant-first

    @property
    def resolved(self) -> bool:
        return self.road_code is not None


def select_road(
    roads: list[dict],
    village_name: str | None = None,
    parcel_road: str | None = None,
) -> RoadResolution:
    """Resolve which Kaveri road to price a parcel against, with an explicit
    confidence + method so the caller can distinguish "confidently resolved"
    from "best guess, don't treat as authoritative" (spec's Part 6/Part 7).

    Priority:
      1. A cadastral road attribute on the parcel, if present, matched by name
         -> `exact_road_attribute`, high confidence.
      2. The one non-generic road/locality Kaveri has for this village (no
         other candidate to be ambiguous against) -> `village_default`,
         moderate confidence.
      3. The road whose name best matches the village name, among actual named
         roads (never "Flat/Apartment"/"Other Road" as the preferred guess)
         -> `locality_name_match` when the similarity is decent,
         `village_default` when it's weak.
      4. No name signal at all and multiple candidates -> `manual_required`,
         low confidence; caller should treat this as ambiguous.

    `ranked` always carries every road Kaveri returned (not just the
    non-generic ones) so a caller building a `road_selection_required` picker
    still has the full list.
    """
    choices: list[RoadCandidate] = []
    for road in roads:
        code = extract_value(road, ("roadcode", "code"))
        name = extract_value(road, ("roadnamee", "roadname", "name"))
        if code:
            choices.append(RoadCandidate(code, name))

    if not choices:
        return RoadResolution(None, None, 0.0, "manual_required", [])

    primary = [c for c in choices if not _is_low_signal_road(c.name)]
    pool = primary or choices
    low_signal = [c for c in choices if c not in pool]

    # `full_ranked` orders every candidate most-relevant-first: the matched
    # attribute or best name match leads, followed by the rest of `pool` in
    # the same relevance order, with low-signal (flat/apartment/other-road)
    # entries always pushed to the end. Callers checking "does any other
    # plausible road have a rate" (spec Part 8) iterate this in order.
    def _reorder(head: RoadCandidate, rest_sorted: list[RoadCandidate]) -> list[RoadCandidate]:
        rest = [c for c in rest_sorted if c.code != head.code]
        return [head, *rest, *low_signal]

    if parcel_road:
        p = normalize_name(parcel_road)
        for c in choices:
            if normalize_name(c.name) == p:
                rest_sorted = sorted(pool, key=lambda x: x.code)
                return RoadResolution(
                    c.code, c.name, ROAD_CONFIDENCE_EXACT_ATTRIBUTE, "exact_road_attribute", _reorder(c, rest_sorted)
                )

    if len(pool) == 1:
        c = pool[0]
        return RoadResolution(c.code, c.name, ROAD_CONFIDENCE_SINGLE_CANDIDATE, "village_default", [c, *low_signal])

    if village_name:
        v = normalize_name(village_name)
        ranked = sorted(pool, key=lambda c: similarity(v, normalize_name(c.name)), reverse=True)
        best = ranked[0]
        score = similarity(v, normalize_name(best.name))
        method = "locality_name_match" if score >= 60.0 else "village_default"
        confidence = min(0.5 + score / 200.0, 0.9) if score >= 60.0 else ROAD_CONFIDENCE_LOW_MATCH
        return RoadResolution(best.code, best.name, confidence, method, [*ranked, *low_signal])

    ranked = sorted(pool, key=lambda c: c.code)
    best = ranked[0]
    return RoadResolution(best.code, best.name, ROAD_CONFIDENCE_NO_SIGNAL, "manual_required", [*ranked, *low_signal])


# --- Taluk-wide village search (replaces the old exact-name-only hobli
# disambiguation) -----------------------------------------------------------
# Once district + taluk are resolved we enumerate EVERY Kaveri village under
# EVERY hobli of that taluk and search for the target village by *fuzzy*
# similarity — never by exact name alone. This is what makes the resolver
# robust to the three systemic failure modes the task calls out:
#
#   * a KGIS hobli whose spelling differs from Kaveri's (the village still
#     pins the correct hobli via membership);
#   * a KGIS hobli that maps to a Kaveri hobli (e.g. "Kundagola Town") which is
#     genuinely EMPTY, while the village actually sits in a *different* hobli of
#     the same taluk (verified live: KGIS "Kundagola"/Yaliwala -> Kaveri
#     "Kundagola Town" has 0 villages, but "Yalivela" exists under "Kundagol
#     Hobli");
#   * place-name variants (Yare Bhudhihala -> "Yarebodihala", Yaliwala ->
#     "Yalivela") that no exact-name match would ever catch.
#
# Karnataka's KGIS and Kaveri datasets routinely disagree on which
# administrative level a name belongs to, so *membership evidence* (a unique
# village under the resolved taluk) outranks a weak hobli-name string score.
UNIQUE_VILLAGE_HOBLI_SCORE = 96.0
AMBIGUOUS_VILLAGE_MULTIPLE_HOBLIS_SCORE = 85.0

# A village candidate at/above this similarity, found anywhere in the resolved
# taluk, is treated as a "real" match. Data-driven — no village-name allow-list.
STRONG_VILLAGE_SIMILARITY = 80.0
# Two-or-more candidates at/above this -> genuinely ambiguous (forced to
# pending_review, never silently confirmed). Deliberately BELOW STRONG so that
# one near-exact hit alongside a weaker near-duplicate does NOT spuriously trip
# ambiguity (e.g. Beltangadi at 100 next to a 85%-similar neighbour must stay
# unique). The actual ambiguity test (see `_decide_village_candidate`) is stricter
# still: a *second* candidate only counts as a genuine tie when it is within
# AMBIGUITY_GAP of the top score — so "Hulagina Katti" (100) is never flagged
# ambiguous just because an unrelated-but-similarly-spelled "Galagina Katti"
# (91.7) also exists in the same taluk.
AMBIGUOUS_VILLAGE_SIMILARITY = 88.0
# Max score gap between the top candidate and a second candidate for the two to
# count as a genuine ambiguity (rather than one clear winner + a distant look-
# alike). Keeps a 100/91.7 pair unique while still catching true duplicate
# villages (both 100, or both ~85 within 5 points).
AMBIGUITY_GAP = 5.0
# Candidates below this are not even worth ranking for diagnostics.
VILLAGE_SEARCH_FLOOR = 50.0


def _search_villages_in_taluk(
    village_query: str,
    hoblis: list[dict],
    villages_by_hobli: dict[str, list[dict]],
) -> list[tuple[dict, dict, float]]:
    """Ranked (hobli, village, score) candidates for `village_query` across ALL
    hoblis of the resolved taluk. Pure fuzzy lookup — no aliasing, no
    exact-name requirement. Returns candidates with score >= VILLAGE_SEARCH_FLOOR,
    best-first. Requires `villages_by_hobli` to already contain each hobli's
    village list (both callers arrange this)."""
    target = normalize_name(village_query)
    if not target:
        return []
    hits: list[tuple[dict, dict, float]] = []
    for candidate_hobli in hoblis:
        hcode = extract_value(candidate_hobli, CODE_KEYS_HOBLI)
        for v in villages_by_hobli.get(hcode, []):
            score = similarity(target, normalize_name(extract_value(v, NAME_KEYS_VILLAGE)))
            if score >= VILLAGE_SEARCH_FLOOR:
                hits.append((candidate_hobli, v, score))
    hits.sort(key=lambda x: -x[2])
    return hits


@dataclass
class VillageDecision:
    kaveri_hobli_code: str | None
    kaveri_village_code: str | None
    village_score: float
    method: str
    ambiguous: bool
    candidates: list[tuple[dict, dict, float]]


def _decide_village_candidate(
    village_query: str,
    hoblis: list[dict],
    villages_by_hobli: dict[str, list[dict]],
) -> VillageDecision:
    """Search the whole taluk and decide the village (and thereby its hobli).

    - exactly one candidate at/above STRONG (and no other at/above AMBIGUOUS)
      -> accept it as `unique_village_within_taluk`;
    - two+ candidates at/above AMBIGUOUS -> genuinely ambiguous: a representative
      candidate is returned but `ambiguous=True` so the caller keeps it in
      `pending_review` (never silently confirmed);
    - nothing strong -> `kaveri_village_code` is None and the caller must try
      the alternate-taluk path or declare the source absent.
    """
    candidates = _search_villages_in_taluk(village_query, hoblis, villages_by_hobli)
    strong = [c for c in candidates if c[2] >= STRONG_VILLAGE_SIMILARITY]
    if not strong:
        return VillageDecision(None, None, 0.0, "no_village_candidate", False, candidates)
    top = strong[0]
    # Genuine ambiguity requires a second candidate that is itself a strong match
    # AND close to the top score — a distant look-alike (e.g. "Galagina Katti"
    # 91.7 next to "Hulagina Katti" 100) is NOT a tie.
    ambiguity_floor = max(top[2] - AMBIGUITY_GAP, STRONG_VILLAGE_SIMILARITY)
    ambiguous = len([c for c in strong if c[2] >= ambiguity_floor]) > 1
    hcode = extract_value(top[0], CODE_KEYS_HOBLI)
    vcode = extract_value(top[1], CODE_KEYS_VILLAGE)
    method = "ambiguous_village_multiple_hoblis" if ambiguous else "unique_village_within_taluk"
    return VillageDecision(hcode, vcode, top[2], method, ambiguous, candidates)


def _find_village_across_hoblis(
    village_query: str,
    hoblis: list[dict],
    villages_by_hobli: dict[str, list[dict]],
) -> list[tuple[dict, dict]]:
    """Back-compat thin wrapper: exact-normalized (hobli, village) hits. Retained
    for callers/tests that only care about exact-name matches; the fuzzy
    `_search_villages_in_taluk` is now the primary path."""
    target = normalize_name(village_query)
    if not target:
        return []
    hits: list[tuple[dict, dict]] = []
    for candidate_hobli in hoblis:
        hcode = extract_value(candidate_hobli, CODE_KEYS_HOBLI)
        for v in villages_by_hobli.get(hcode, []):
            if normalize_name(extract_value(v, NAME_KEYS_VILLAGE)) == target:
                hits.append((candidate_hobli, v))
    return hits


def _resolve_from_lists(
    districts: list[dict],
    taluks_by_district: dict[str, list[dict]],
    hoblis_by_taluk: dict[str, list[dict]],
    villages_by_hobli: dict[str, list[dict]],
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    kgis_village_code: str | None = None,
) -> KaveriResolution:
    """Core 4-level match against pre-fetched candidate lists. Shared by both
    the live endpoint and the bulk generator so behaviour never diverges.

    Village resolution is taluk-wide and fuzzy (see `_decide_village_candidate`):
    once district+taluk are pinned we search EVERY village under EVERY hobli of
    the resolved taluk, so a unique fuzzy village wins even when the KGIS hobli
    spelling (or the KGIS-vs-Kaveri administrative depth) differs. The hobli
    name score is never the binding constraint once a unique village pins it."""
    bhoomi_d = compute_bhoomi_district(kgis_village_code)

    d = match_level(
        district,
        districts,
        NAME_KEYS_DISTRICT,
        bhoomi_query=bhoomi_d,
        bhoomi_key=BHOOMI_KEY_DISTRICT,
    )
    dcode = extract_value(d.candidate, CODE_KEYS_DISTRICT) if d.candidate else None

    taluks = taluks_by_district.get(dcode, []) if dcode else []
    t = match_level(taluk, taluks, NAME_KEYS_TALUK)
    tcode = extract_value(t.candidate, CODE_KEYS_TALUK) if t.candidate else None

    hoblis = hoblis_by_taluk.get(tcode, []) if tcode else []
    h = match_level(hobli, hoblis, NAME_KEYS_HOBLI)
    # All hoblis' villages are already in the cached tree, so a taluk-wide
    # fan-out costs nothing extra here.
    decision = _decide_village_candidate(village, hoblis, villages_by_hobli)
    hcode, vcode, village_score, method, ambiguous = (
        decision.kaveri_hobli_code,
        decision.kaveri_village_code,
        decision.village_score,
        decision.method,
        decision.ambiguous,
    )
    villages_by_hobli_used = villages_by_hobli

    # No strong candidate across the whole primary taluk. The KGIS *hobli* name
    # may actually be a Kaveri *taluk* (Karnataka has promoted hoblis to taluks
    # and KGIS/Kaveri don't always agree on the level) — try that before giving
    # up. Only a strong taluk-name match counts (structural escalation, not a
    # fuzzy guess); then run the same taluk-wide village search there.
    if vcode is None:
        alt_t = match_level(hobli, taluks, NAME_KEYS_TALUK)
        alt_tcode = extract_value(alt_t.candidate, CODE_KEYS_TALUK) if alt_t.candidate else None
        if alt_t.score >= AUTO_CONFIRM_THRESHOLD and alt_tcode and alt_tcode != tcode:
            alt_hoblis = hoblis_by_taluk.get(alt_tcode, [])
            alt_villages = {
                extract_value(ah, CODE_KEYS_HOBLI): villages_by_hobli.get(extract_value(ah, CODE_KEYS_HOBLI), [])
                for ah in alt_hoblis
            }
            alt_decision = _decide_village_candidate(village, alt_hoblis, alt_villages)
            if alt_decision.kaveri_village_code is not None:
                t = LevelMatch(alt_t.candidate, UNIQUE_VILLAGE_HOBLI_SCORE, "hobli_matched_as_alternate_taluk")
                tcode = alt_tcode
                hcode = alt_decision.kaveri_hobli_code
                vcode = alt_decision.kaveri_village_code
                village_score = alt_decision.village_score
                ambiguous = alt_decision.ambiguous
                method = (
                    "ambiguous_village_alternate_taluk"
                    if alt_decision.ambiguous
                    else "unique_village_in_alternate_taluk"
                )
                villages_by_hobli_used = alt_villages

    # Fallback: still nothing strong anywhere. Keep the nominal per-level village
    # match inside the matched hobli so we still report the closest candidate
    # (and its low score) instead of a hard zero — the caller treats a sub-threshold
    # confidence as a failed mapping, never as a false positive.
    if vcode is None:
        hcode = extract_value(h.candidate, CODE_KEYS_HOBLI) if h.candidate else None
        villages = villages_by_hobli.get(hcode, []) if hcode else []
        v = match_level(village, villages, NAME_KEYS_VILLAGE)
        vcode = extract_value(v.candidate, CODE_KEYS_VILLAGE) if v.candidate else None
        village_score = v.score
        method = h.method if h.candidate else "no_village_candidate"

    # When a unique village pins the hobli (primary taluk or alternate), the
    # village's own similarity is the evidence for THAT hobli — its membership
    # under it IS the proof. A weak hobli-name string score must never sink an
    # otherwise-strong mapping. A genuinely ambiguous (2+ strong) village is
    # capped at the ambiguous band instead.
    hobli_score = h.score
    if vcode is not None:
        if ambiguous:
            hobli_score = max(h.score, AMBIGUOUS_VILLAGE_MULTIPLE_HOBLIS_SCORE)
        else:
            hobli_score = max(h.score, UNIQUE_VILLAGE_HOBLI_SCORE)

    scores = [d.score, t.score, hobli_score, village_score]
    valid = [s for s in scores if s > 0]
    confidence = min(valid) if valid else 0.0
    if ambiguous:
        # Never auto-confirm a genuinely ambiguous (2+ strong) village.
        confidence = min(confidence, AMBIGUOUS_VILLAGE_MULTIPLE_HOBLIS_SCORE)
    return KaveriResolution(
        kaveri_district_code=dcode,
        kaveri_taluk_code=tcode,
        kaveri_hobli_code=hcode,
        kaveri_village_code=vcode,
        confidence=confidence,
        district_score=d.score,
        taluk_score=t.score,
        hobli_score=hobli_score,
        village_score=village_score,
        village_candidate=(
            match_level(village, villages_by_hobli_used.get(hcode, []), NAME_KEYS_VILLAGE).candidate
            if vcode and hcode
            else None
        ),
        method=method,
    )


def resolve_in_hierarchy(
    hierarchy: Any,
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    kgis_village_code: str | None = None,
) -> KaveriResolution:
    """Resolve against a cached `KaveriHierarchy` (used by the bulk generator)."""
    return _resolve_from_lists(
        hierarchy.districts,
        hierarchy.taluks_by_district_code,
        hierarchy.hoblis_by_taluk_code,
        hierarchy.villages_by_hobli_code,
        district,
        taluk,
        hobli,
        village,
        kgis_village_code,
    )


async def resolve_kaveri_location(
    session: KaveriSession,
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    kgis_village_code: str | None = None,
    trace: dict | None = None,
) -> KaveriResolution:
    """Resolve a location against the live Kaveri portal, fetching only the
    hierarchy path actually needed (District → its Taluks → the Taluk's Hoblis
    → the Hobli's Villages) — never the whole state's tree, so a per-parcel-click
    call stays cheap.

    Matching order matters: we resolve each level *before* fetching its
    children, so a failed district match short-circuits to an empty candidate
    list for taluks, etc., and the final confidence naturally reflects that.
    """
    bhoomi_d = compute_bhoomi_district(kgis_village_code)
    logger.info(
        "RESOLVER input: district=%r taluk=%r hobli=%r village=%r "
        "kgis_village_code=%s bhoomi_district=%s",
        district, taluk, hobli, village, kgis_village_code, bhoomi_d,
    )
    tr = trace if trace is not None else {}
    tr["input"] = {
        "district": district,
        "taluk": taluk,
        "hobli": hobli,
        "village": village,
        "kgis_village_code": kgis_village_code,
        "bhoomi_district_code": bhoomi_d,
    }

    districts = await session.get_districts()
    district_names = [extract_value(x, NAME_KEYS_DISTRICT) for x in districts]
    logger.info("KAVERI district candidates: %s", district_names)
    tr["district_candidates"] = [
        {
            "name": extract_value(x, NAME_KEYS_DISTRICT),
            "code": extract_value(x, CODE_KEYS_DISTRICT),
            "bhoomi_district_code": extract_value(x, BHOOMI_KEY_DISTRICT),
        }
        for x in districts
    ]
    d = match_level(
        district,
        districts,
        NAME_KEYS_DISTRICT,
        bhoomi_query=bhoomi_d,
        bhoomi_key=BHOOMI_KEY_DISTRICT,
    )
    dcode = extract_value(d.candidate, CODE_KEYS_DISTRICT) if d.candidate else None
    logger.info(
        "Selected district: districtCode=%s (score=%.1f, method=%s)",
        dcode, d.score, d.method,
    )
    tr["selected_district"] = {"code": dcode, "score": d.score, "method": d.method}

    taluks = await session.get_taluks(dcode) if dcode else []
    taluk_names = [extract_value(x, NAME_KEYS_TALUK) for x in taluks]
    logger.info("KAVERI taluk candidates: %s", taluk_names)
    tr["taluk_candidates"] = [
        {"name": extract_value(x, NAME_KEYS_TALUK), "code": extract_value(x, CODE_KEYS_TALUK)}
        for x in taluks
    ]
    t = match_level(taluk, taluks, NAME_KEYS_TALUK)
    tcode = extract_value(t.candidate, CODE_KEYS_TALUK) if t.candidate else None
    logger.info("Selected taluk: talukCode=%s (score=%.1f, method=%s)", tcode, t.score, t.method)
    tr["selected_taluk"] = {"code": tcode, "score": t.score, "method": t.method}

    hoblis = await session.get_hoblis(tcode) if tcode else []
    hobli_names = [extract_value(x, NAME_KEYS_HOBLI) for x in hoblis]
    logger.info("KAVERI hobli candidates: %s", hobli_names)
    tr["hobli_candidates"] = [
        {"name": extract_value(x, NAME_KEYS_HOBLI), "code": extract_value(x, CODE_KEYS_HOBLI)}
        for x in hoblis
    ]
    h = match_level(hobli, hoblis, NAME_KEYS_HOBLI)
    logger.info(
        "Best fuzzy hobli match: %s (score=%.1f, method=%s)",
        extract_value(h.candidate, NAME_KEYS_HOBLI) if h.candidate else None, h.score, h.method,
    )
    tr["selected_hobli"] = {
        "code": extract_value(h.candidate, CODE_KEYS_HOBLI) if h.candidate else None,
        "score": h.score,
        "method": h.method,
    }

    # Taluk-wide village fan-out. Enumerate EVERY Kaveri village under EVERY
    # hobli of the resolved taluk (never just the one hobli the KGIS name
    # fuzzy-matched, which can be empty or a different administrative level) and
    # search for the target village by fuzzy similarity. This is what fixes the
    # "low hobli score" and "village score 0" systemic failures: a unique fuzzy
    # village anywhere in the taluk pins its real hobli, and a KGIS hobli that
    # maps to an empty Kaveri hobli no longer blinds the search.
    villages_by_hobli: dict[str, list[dict]] = {}
    for candidate_hobli in hoblis:
        hb_code = extract_value(candidate_hobli, CODE_KEYS_HOBLI)
        if hb_code:
            villages_by_hobli[hb_code] = await session.get_villages(hb_code)

    decision = _decide_village_candidate(village, hoblis, villages_by_hobli)
    tr["village_search"] = {
        "searched_hoblis": len(hoblis),
        "candidates": [
            {
                "hobli_code": extract_value(hb, CODE_KEYS_HOBLI),
                "village_name": extract_value(vv, NAME_KEYS_VILLAGE),
                "village_code": extract_value(vv, CODE_KEYS_VILLAGE),
                "score": round(sc, 1),
            }
            for hb, vv, sc in decision.candidates[:10]
        ],
    }
    if decision.candidates:
        logger.info(
            "Village %r searched across all %d hoblis under taluk %s -> top candidates: %s",
            village, len(hoblis), tcode,
            [(extract_value(vv, NAME_KEYS_VILLAGE), round(sc, 1)) for _hb, vv, sc in decision.candidates[:10]],
        )

    method = decision.method
    hcode = decision.kaveri_hobli_code
    vcode = decision.kaveri_village_code
    village_score = decision.village_score
    ambiguous = decision.ambiguous

    # Fallback: nothing strong across the whole primary taluk. The KGIS *hobli*
    # name may actually be a Kaveri *taluk* — Karnataka has genuinely promoted
    # some hoblis to full taluk status and KGIS/Kaveri don't always agree on
    # which level a name belongs at (verified live: KGIS "Nuggehalli" is a hobli
    # under "Channarayapatna" in Hassan, but Kaveri lists "Nuggehalli" as its
    # own taluk, and the village exists only there). Only a strong taluk-name
    # match counts — this is a structural escalation, not a fuzzy guess.
    if vcode is None:
        alt_t = match_level(hobli, taluks, NAME_KEYS_TALUK)
        alt_tcode = extract_value(alt_t.candidate, CODE_KEYS_TALUK) if alt_t.candidate else None
        if alt_t.score >= AUTO_CONFIRM_THRESHOLD and alt_tcode and alt_tcode != tcode:
            logger.info(
                "No village match under taluk %s — retrying with KGIS hobli %r as an alternate "
                "Kaveri taluk: matched talukCode=%s (score=%.1f)",
                tcode, hobli, alt_tcode, alt_t.score,
            )
            alt_hoblis = await session.get_hoblis(alt_tcode)
            alt_villages_by_hobli: dict[str, list[dict]] = {}
            for candidate_hobli in alt_hoblis:
                hb_code = extract_value(candidate_hobli, CODE_KEYS_HOBLI)
                if hb_code:
                    alt_villages_by_hobli[hb_code] = await session.get_villages(hb_code)
            alt_decision = _decide_village_candidate(village, alt_hoblis, alt_villages_by_hobli)
            if alt_decision.candidates:
                logger.info(
                    "Village %r searched across all %d hoblis under alternate taluk %s -> top candidates: %s",
                    village, len(alt_hoblis), alt_tcode,
                    [(extract_value(vv, NAME_KEYS_VILLAGE), round(sc, 1)) for _hb, vv, sc in alt_decision.candidates[:10]],
                )
            if alt_decision.kaveri_village_code is not None:
                t = LevelMatch(alt_t.candidate, UNIQUE_VILLAGE_HOBLI_SCORE, "hobli_matched_as_alternate_taluk")
                tcode = alt_tcode
                h = LevelMatch(
                    None, alt_decision.village_score, "unique_village_in_alternate_taluk"
                )
                hcode = alt_decision.kaveri_hobli_code
                vcode = alt_decision.kaveri_village_code
                village_score = alt_decision.village_score
                ambiguous = alt_decision.ambiguous
                method = (
                    "ambiguous_village_alternate_taluk"
                    if alt_decision.ambiguous
                    else "unique_village_in_alternate_taluk"
                )
                villages_by_hobli = alt_villages_by_hobli

    # When a unique village pins the hobli (whether in the primary taluk or an
    # alternate one), the village's own similarity is the evidence for THAT
    # hobli — a weak hobli-name string score must never sink an otherwise-strong
    # mapping.
    hobli_score = h.score
    if vcode is not None and not ambiguous:
        hobli_score = max(h.score, UNIQUE_VILLAGE_HOBLI_SCORE)
    elif vcode is not None and ambiguous:
        hobli_score = max(h.score, AMBIGUOUS_VILLAGE_MULTIPLE_HOBLIS_SCORE)

    villages = villages_by_hobli.get(hcode, []) if hcode else []
    v_candidate = match_level(village, villages, NAME_KEYS_VILLAGE).candidate if villages else None
    logger.info(
        "Selected taluk/hobli/village: talukCode=%s talukScore=%.1f hobliCode=%s "
        "hobliScore=%.1f villageCode=%s villageScore=%.1f method=%s ambiguous=%s",
        tcode, t.score, hcode, hobli_score, vcode, village_score, method, ambiguous,
    )

    scores = [d.score, t.score, hobli_score, village_score]
    valid = [s for s in scores if s > 0]
    confidence = min(valid) if valid else 0.0
    if ambiguous:
        # Never auto-confirm a genuinely ambiguous (2+ strong) village.
        confidence = min(confidence, AMBIGUOUS_VILLAGE_MULTIPLE_HOBLIS_SCORE)
    result = KaveriResolution(
        kaveri_district_code=dcode,
        kaveri_taluk_code=tcode,
        kaveri_hobli_code=hcode,
        kaveri_village_code=vcode,
        confidence=confidence,
        district_score=d.score,
        taluk_score=t.score,
        hobli_score=hobli_score,
        village_score=village_score,
        village_candidate=v_candidate,
        method=method,
    )
    tr["resolution"] = {
        "kaveri_district_code": result.kaveri_district_code,
        "kaveri_taluk_code": result.kaveri_taluk_code,
        "kaveri_hobli_code": result.kaveri_hobli_code,
        "kaveri_village_code": result.kaveri_village_code,
        "confidence": result.confidence,
        "matched": result.matched,
        "method": result.method,
    }
    return result


async def resolve_kaveri_location_debug(
    session: KaveriSession,
    district: str,
    taluk: str,
    hobli: str,
    village: str,
    kgis_village_code: str | None = None,
) -> dict:
    """Dev-only diagnostic wrapper around :func:`resolve_kaveri_location`.

    Returns a dict with two keys:
      - ``resolution``: the normal :class:`KaveriResolution` (as a dict).
      - ``trace``: a step-by-step record of every candidate list considered
        (districts, taluks, hoblis, the taluk-wide village search, and the
        selected codes + scores at each level) so a developer can see *why* a
        mapping resolved the way it did — essential for auditing the generic
        resolver against live Kaveri data without guessing.

    This never changes resolution behaviour; it only surfaces the internal
    decision trace. Frontend/debug tooling uses it; production rate lookups
    use :func:`resolve_kaveri_location`.
    """
    trace: dict = {}
    resolution = await resolve_kaveri_location(
        session, district, taluk, hobli, village, kgis_village_code, trace=trace
    )
    return {
        "resolution": {
            "kaveri_district_code": resolution.kaveri_district_code,
            "kaveri_taluk_code": resolution.kaveri_taluk_code,
            "kaveri_hobli_code": resolution.kaveri_hobli_code,
            "kaveri_village_code": resolution.kaveri_village_code,
            "confidence": resolution.confidence,
            "matched": resolution.matched,
            "method": resolution.method,
            "district_score": resolution.district_score,
            "taluk_score": resolution.taluk_score,
            "hobli_score": resolution.hobli_score,
            "village_score": resolution.village_score,
        },
        "trace": trace,
    }


@dataclass
class SiblingVillage:
    code: str
    name: str


def find_sibling_villages(
    primary_village_name: str,
    hobli_villages: list[dict],
    primary_village_code: str,
) -> list[SiblingVillage]:
    """Other villages in the SAME already-resolved Kaveri hobli whose
    normalized name contains (or is contained by) the primary village's name
    as a prefix — e.g. "Beltangadi" / "Beltangadi Town". This is a real,
    recurring Kaveri data-modeling pattern (verified live): the plain
    administrative village record is sometimes an empty placeholder with no
    published rate, while a second record in the same hobli — typically
    suffixed "Town"/"City"/"Rural" — is where Kaveri actually publishes SR
    rates for that settlement.

    NOT a name alias: matching is scoped to villages already confirmed to sit
    in the same Kaveri hobli as the primary match (so it can never pull in an
    unrelated village that merely shares a word), and is a *prefix*
    relationship on the normalized name, not fuzzy similarity — "Beltangadi"
    is literally a prefix of "Beltangaditown" after normalization. Callers
    must only use this as a secondary check after the primary village's own
    roads have been exhaustively checked for a rate (see
    `app.api.v1.pricing`), and must still validate that a sibling candidate
    actually carries a rate before ever using it — this function only
    proposes candidates, it never claims one is authoritative.
    """
    target = normalize_name(primary_village_name)
    if not target:
        return []
    siblings: list[SiblingVillage] = []
    for v in hobli_villages:
        code = extract_value(v, CODE_KEYS_VILLAGE)
        if not code or code == primary_village_code:
            continue
        name = extract_value(v, NAME_KEYS_VILLAGE)
        norm = normalize_name(name)
        if not norm or norm == target:
            continue
        if norm.startswith(target) or target.startswith(norm):
            siblings.append(SiblingVillage(code, name))
    return siblings
