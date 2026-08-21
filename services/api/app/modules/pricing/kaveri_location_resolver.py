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
    # Drop a leading single initial like "A." ("a.interesting" -> "interesting").
    text = re.sub(r"^\s*[a-z]\.?\s*", "", text)
    text = re.sub(r"\s+", "", text)
    for variant, canonical in _TRANSLITERATION_VARIANTS:
        text = text.replace(variant, canonical)
    return text


def _partial_ratio(a: str, b: str) -> float:
    """Best similarity of the shorter string against any equal-length window
    of the longer one. Catches abbreviations/transliteration where one name is
    a clipped version of the other (e.g. "ingalagaov" vs "ingalagaon"), which
    plain `SequenceMatcher` on the whole strings under-scores."""
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

    @property
    def matched(self) -> bool:
        return self.kaveri_village_code is not None


def select_road(
    roads: list[dict],
    village_name: str | None = None,
    parcel_road: str | None = None,
) -> tuple[str | None, str | None, list[tuple[str, str]]]:
    """Resolve which Kaveri road to price a parcel against.

    Priority (spec's MAPPING WORKFLOW):
      1. A cadastral road attribute on the parcel, if present, matched by name.
      2. Otherwise the road whose name best matches the village name (so a
         village with several roads isn't blindly priced off `roads[0]`).
      3. With neither signal, fall back to the lowest road code deterministically.

    Returns ``(road_code, road_name, ranked_choices)``. `ranked_choices` is the
    full list (code, name) most-similar-first, so a future UI can present
    ambiguous roads as a picker instead of guessing.
    """
    choices: list[tuple[str, str]] = []
    for road in roads:
        code = extract_value(road, ("roadcode", "code"))
        name = extract_value(road, ("roadnamee", "roadname", "name"))
        if code:
            choices.append((code, name))

    if not choices:
        return (None, None, [])

    if parcel_road:
        p = normalize_name(parcel_road)
        for code, name in choices:
            if normalize_name(name) == p:
                return (code, name, choices)

    if village_name:
        v = normalize_name(village_name)
        ranked = sorted(choices, key=lambda c: similarity(v, normalize_name(c[1])), reverse=True)
        best = ranked[0]
        return (best[0], best[1], ranked)

    ranked = sorted(choices, key=lambda c: c[0])
    return (ranked[0][0], ranked[0][1], ranked)


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
    the live endpoint and the bulk generator so behaviour never diverges."""
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
    hcode = extract_value(h.candidate, CODE_KEYS_HOBLI) if h.candidate else None

    villages = villages_by_hobli.get(hcode, []) if hcode else []
    v = match_level(village, villages, NAME_KEYS_VILLAGE)
    vcode = extract_value(v.candidate, CODE_KEYS_VILLAGE) if v.candidate else None

    scores = [d.score, t.score, h.score, v.score]
    valid = [s for s in scores if s > 0]
    confidence = min(valid) if valid else 0.0
    return KaveriResolution(
        kaveri_district_code=dcode,
        kaveri_taluk_code=tcode,
        kaveri_hobli_code=hcode,
        kaveri_village_code=vcode,
        confidence=confidence,
        district_score=d.score,
        taluk_score=t.score,
        hobli_score=h.score,
        village_score=v.score,
        village_candidate=v.candidate,
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

    districts = await session.get_districts()
    district_names = [extract_value(x, NAME_KEYS_DISTRICT) for x in districts]
    logger.info("KAVERI district candidates: %s", district_names)
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

    taluks = await session.get_taluks(dcode) if dcode else []
    taluk_names = [extract_value(x, NAME_KEYS_TALUK) for x in taluks]
    logger.info("KAVERI taluk candidates: %s", taluk_names)
    t = match_level(taluk, taluks, NAME_KEYS_TALUK)
    tcode = extract_value(t.candidate, CODE_KEYS_TALUK) if t.candidate else None
    logger.info("Selected taluk: talukCode=%s (score=%.1f, method=%s)", tcode, t.score, t.method)

    hoblis = await session.get_hoblis(tcode) if tcode else []
    hobli_names = [extract_value(x, NAME_KEYS_HOBLI) for x in hoblis]
    logger.info("KAVERI hobli candidates: %s", hobli_names)
    h = match_level(hobli, hoblis, NAME_KEYS_HOBLI)
    hcode = extract_value(h.candidate, CODE_KEYS_HOBLI) if h.candidate else None
    logger.info("Selected hobli: hobliCode=%s (score=%.1f, method=%s)", hcode, h.score, h.method)

    villages = await session.get_villages(hcode) if hcode else []
    village_names = [extract_value(x, NAME_KEYS_VILLAGE) for x in villages]
    logger.info("KAVERI village candidates: %s", village_names)
    v = match_level(village, villages, NAME_KEYS_VILLAGE)
    vcode = extract_value(v.candidate, CODE_KEYS_VILLAGE) if v.candidate else None
    logger.info(
        "Selected village: villageCode=%s (score=%.1f, method=%s)",
        vcode, v.score, v.method,
    )

    scores = [d.score, t.score, h.score, v.score]
    valid = [s for s in scores if s > 0]
    confidence = min(valid) if valid else 0.0
    return KaveriResolution(
        kaveri_district_code=dcode,
        kaveri_taluk_code=tcode,
        kaveri_hobli_code=hcode,
        kaveri_village_code=vcode,
        confidence=confidence,
        district_score=d.score,
        taluk_score=t.score,
        hobli_score=h.score,
        village_score=v.score,
        village_candidate=v.candidate,
    )
