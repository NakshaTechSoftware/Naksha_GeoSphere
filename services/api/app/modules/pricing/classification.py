"""Land/property classification resolver.

A bare cadastral parcel has no building on it, so "what SR rate applies"
depends entirely on how the *land itself* is classified — never a hardcoded
"Residential" default. Evidence is consulted in the priority order the task
spec lays out, and the resolver stops at the first source that gives a clear
answer:

  1. Bhoomi/RTC land classification (`RtcUseCase.landClassification`, already
     scraped+OCR'd by the frontend's `/api/land-records/rtc` route) — the most
     authoritative source available, since it's the actual government record
     for that survey number.
  2. GIS Category/Landcode attributes already carried on the cadastral layer.
  3. Unknown — never guessed. Callers must then treat classification as
     ambiguous and expose all available Kaveri rate candidates instead of
     picking one.
"""

from __future__ import annotations

from dataclasses import dataclass

# Kaveri's non-agricultural property-type buckets, ranked only for display
# purposes (never used to silently pick a rate when classification is
# unknown).
NON_AGRICULTURAL_SUBTYPES = ("residential", "commercial", "industrial", "vacant_open", "other")


@dataclass(frozen=True, slots=True)
class LandClassification:
    # "agricultural" | "non_agricultural" | "forest" | "government_land" |
    # "waterbody" | "unknown". Kaveri has no SR valuation category for
    # forest/government_land/waterbody — callers must not force these into
    # agricultural/non_agricultural just to get a Kaveri endpoint to query
    # (spec: "do not automatically apply Residential SR" to a forest parcel).
    classification: str
    subtype: str | None  # set only when classification == "non_agricultural"
    confidence: float
    source: str  # "bhoomi_rtc" | "gis_attribute" | "unknown"


_AGRICULTURAL_KEYWORDS = (
    "agri", "agriculture", "farm", "crop", "cultivation", "horticulture",
    "plantation", "orchard", "nursery", "grazing", "pasture", "garden",
    "paddy", "wetland", "dryland", "dry land", "garden land", "bagayat",
)
_NON_AGRICULTURAL_KEYWORDS = ("residential", "commercial", "industrial", "building", "urban", "site", "vacant", "layout")
# Checked BEFORE agricultural/non-agricultural keywords — a "reserved
# forest"/"government land" record must never fall through to being read as
# ordinary agricultural land just because it also mentions cultivation-
# adjacent words, and must never be forced toward Residential just because
# that's the only Kaveri-shaped bucket available.
_FOREST_KEYWORDS = ("forest", "reserved forest", "deemed forest", "revenue forest")
_GOVERNMENT_LAND_KEYWORDS = ("government land", "govt land", "gomal", "poramboke", "sarkari")
_WATERBODY_KEYWORDS = ("waterbody", "water body", "tank", "lake", "kere", "river", "canal")


def _classify_bhoomi(text: str) -> LandClassification | None:
    n = text.strip().lower()
    if not n or n == "unknown":
        return None
    if any(k in n for k in _FOREST_KEYWORDS):
        return LandClassification("forest", None, 0.9, "bhoomi_rtc")
    if any(k in n for k in _WATERBODY_KEYWORDS):
        return LandClassification("waterbody", None, 0.85, "bhoomi_rtc")
    if any(k in n for k in _GOVERNMENT_LAND_KEYWORDS):
        return LandClassification("government_land", None, 0.85, "bhoomi_rtc")
    if "agri" in n:
        return LandClassification("agricultural", None, 0.95, "bhoomi_rtc")
    if "residential" in n:
        return LandClassification("non_agricultural", "residential", 0.9, "bhoomi_rtc")
    if "commercial" in n:
        return LandClassification("non_agricultural", "commercial", 0.9, "bhoomi_rtc")
    if "industrial" in n:
        return LandClassification("non_agricultural", "industrial", 0.9, "bhoomi_rtc")
    # "Government" (Bhoomi's generic patta-type label, distinct from a
    # government-*land-use* record above) and anything else unrecognized is
    # ambiguous with respect to Kaveri's own rate buckets — fall through to
    # GIS evidence rather than guessing.
    return None


def _classify_gis(category: str | None, landcode: str | None) -> LandClassification | None:
    for raw in (category, landcode):
        if not raw:
            continue
        n = str(raw).lower()
        if any(k in n for k in _FOREST_KEYWORDS):
            return LandClassification("forest", None, 0.6, "gis_attribute")
        if any(k in n for k in _WATERBODY_KEYWORDS):
            return LandClassification("waterbody", None, 0.6, "gis_attribute")
        if any(k in n for k in _GOVERNMENT_LAND_KEYWORDS):
            return LandClassification("government_land", None, 0.6, "gis_attribute")
        if any(k in n for k in _AGRICULTURAL_KEYWORDS):
            return LandClassification("agricultural", None, 0.6, "gis_attribute")
        if "residential" in n:
            return LandClassification("non_agricultural", "residential", 0.55, "gis_attribute")
        if "commercial" in n:
            return LandClassification("non_agricultural", "commercial", 0.55, "gis_attribute")
        if "industrial" in n:
            return LandClassification("non_agricultural", "industrial", 0.55, "gis_attribute")
        if any(k in n for k in _NON_AGRICULTURAL_KEYWORDS):
            return LandClassification("non_agricultural", None, 0.45, "gis_attribute")
    return None


def resolve_land_classification(
    *,
    bhoomi_land_classification: str | None = None,
    category: str | None = None,
    landcode: str | None = None,
) -> LandClassification:
    """Resolve a parcel's land classification from the best available
    evidence. Returns classification="unknown" (never a guessed default) when
    nothing usable is present."""
    if bhoomi_land_classification:
        result = _classify_bhoomi(bhoomi_land_classification)
        if result is not None:
            return result

    result = _classify_gis(category, landcode)
    if result is not None:
        return result

    return LandClassification("unknown", None, 0.0, "unknown")
