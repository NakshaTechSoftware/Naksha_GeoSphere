"""KGIS ↔ Kaveri name-matching algorithm.

Pure, I/O-free functions (no HTTP, no DB) so the matching logic itself can be
unit-tested independently of the generator script that drives it — see
`services/api/tests/test_village_matching.py`.

Kaveri's hierarchy uses entirely different internal codes than this
platform's KGIS codes at every level (district/taluk/hobli/village), so
resolving each level is always by *name*, never by code. District/taluk/
hobli lists are short (tens of entries) and comparatively clean, so
`match_hierarchy_name` is used identically for all three. Villages are where
almost all of the real-world spelling/transliteration variance lives, so
`match_village` implements the task spec's full 4-priority cascade instead
of a single fuzzy pass.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Protocol

# Score bands the spec calls for. A village scoring below REJECT_THRESHOLD is
# never written to kaveri_village_mapping at all (see the generator script) -
# only recorded in the progress table + CSV report as "failed", so a bad
# guess can never masquerade as a real mapping.
AUTO_CONFIRM_THRESHOLD = 95.0
PENDING_REVIEW_THRESHOLD = 80.0

# A handful of transliteration variants seen across KGIS/Kaveri/Bhoomi data
# for the same underlying Kannada sound - collapsed before comparison so
# e.g. "Belthangadi" and "Beltangadi" normalize identically. Deliberately
# small and conservative (real Kannada transliteration has far more
# variation than this could ever fully cover) rather than an attempt at a
# general transliteration engine.
_TRANSLITERATION_VARIANTS: tuple[tuple[str, str], ...] = (
    ("v", "w"),
    ("th", "t"),
    ("dh", "d"),
    ("bh", "b"),
    ("kh", "k"),
    ("gh", "g"),
    ("ph", "p"),
)


def normalize_name(name: str) -> str:
    """Lowercase, strip accents/punctuation/whitespace, collapse the
    transliteration variants above. Two names that normalize to the same
    string are treated as an exact match (spec's Priority 1)."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "", text)
    for variant, canonical in _TRANSLITERATION_VARIANTS:
        text = text.replace(variant, canonical)
    return text


def similarity_score(a: str, b: str) -> float:
    """0-100 similarity between two already-normalized strings."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio() * 100.0


class NamedCandidate(Protocol):
    """Minimal shape `match_hierarchy_name`/`match_village` need from a
    Kaveri hierarchy entry — a plain dict satisfies this via `.get`."""

    def get(self, key: str, default: object = None) -> object: ...


@dataclass(frozen=True, slots=True)
class HierarchyMatch:
    candidate: dict
    score: float


def match_hierarchy_name(
    name: str, candidates: list[dict], *, name_key: str
) -> HierarchyMatch | None:
    """District/Taluk/Hobli resolution: normalized-exact match first (score
    100), else the best fuzzy candidate. Returns None only if `candidates`
    is empty - a non-empty list always returns *some* best guess, since the
    caller (village-level matching) applies its own ancestor-confidence
    dampening rather than this function silently giving up."""
    if not candidates:
        return None
    target = normalize_name(name)
    best: HierarchyMatch | None = None
    for candidate in candidates:
        candidate_name = str(candidate.get(name_key, ""))
        normalized = normalize_name(candidate_name)
        if normalized == target:
            return HierarchyMatch(candidate=candidate, score=100.0)
        score = similarity_score(target, normalized)
        if best is None or score > best.score:
            best = HierarchyMatch(candidate=candidate, score=score)
    return best


@dataclass(frozen=True, slots=True)
class VillageMatch:
    candidate: dict
    score: float
    priority: int  # 1-4, which cascade step produced the match - kept for the CSV/logs


def match_village(
    kgis_village_name: str,
    kgis_taluk: str,
    kgis_district: str,
    candidates: list[dict],
    *,
    name_key: str = "villagename",
    taluk_key: str = "taluk",
    district_key: str = "district",
) -> VillageMatch | None:
    """The spec's exact 4-priority cascade:

    1. Exact normalized village-name match.
    2. Exact name match where the candidate also carries a matching taluk.
    3. Exact name match where the candidate also carries a matching district.
    4. Best fuzzy name match, regardless of taluk/district.

    In practice `candidates` is almost always already scoped to one
    correctly-resolved Kaveri hobli (see the generator script), so steps 1-3
    usually agree - the taluk/district checks matter when a caller ever
    passes a broader, less-scoped candidate pool where the same village name
    could plausibly belong to more than one taluk.
    """
    if not candidates:
        return None

    target_name = normalize_name(kgis_village_name)
    target_taluk = normalize_name(kgis_taluk)
    target_district = normalize_name(kgis_district)

    exact_name_matches = [
        c for c in candidates if normalize_name(str(c.get(name_key, ""))) == target_name
    ]

    if exact_name_matches:
        # Priority 2: exact name + taluk.
        for candidate in exact_name_matches:
            if taluk_key in candidate and normalize_name(str(candidate[taluk_key])) == target_taluk:
                return VillageMatch(candidate=candidate, score=100.0, priority=2)
        # Priority 3: exact name + district.
        for candidate in exact_name_matches:
            if (
                district_key in candidate
                and normalize_name(str(candidate[district_key])) == target_district
            ):
                return VillageMatch(candidate=candidate, score=98.0, priority=3)
        # Priority 1: exact name alone (no taluk/district field to cross-check,
        # or none of them matched - still the strongest signal available).
        return VillageMatch(candidate=exact_name_matches[0], score=97.0, priority=1)

    # Priority 4: fuzzy fallback across every candidate.
    best: VillageMatch | None = None
    for candidate in candidates:
        candidate_name = str(candidate.get(name_key, ""))
        score = similarity_score(target_name, normalize_name(candidate_name))
        if best is None or score > best.score:
            best = VillageMatch(candidate=candidate, score=score, priority=4)
    return best


def status_for_score(score: float) -> str:
    """Maps a final (ancestor-dampened) score to the spec's status bands.
    Returns the plain string value (not the enum) so this module stays
    dependency-free from the SQLAlchemy models - the caller converts."""
    if score >= AUTO_CONFIRM_THRESHOLD:
        return "confirmed"
    if score >= PENDING_REVIEW_THRESHOLD:
        return "pending_review"
    return "failed"
