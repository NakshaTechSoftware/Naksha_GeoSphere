"""Resolves WHICH Kaveri agricultural rate category applies to a parcel,
once land classification itself has already been determined to be
agricultural.

Kaveri's agricultural rate list for a single road/locality routinely carries
several distinct categories at once (verified live, Odilnal village, Main
Road): "Bagayat, Dry", "Bagayat, Wet", "Bagayat Coconut", "Bagayat Arecanut &
venilla", "Plantation, Rubber/Areca nut" — each with its own rate. Knowing a
parcel is "agricultural" is not enough to pick between these; picking
`entries[0]` (the previous behaviour) silently assigned every agricultural
parcel in a village the same arbitrary category regardless of what's actually
grown there.

This module maps RTC crop/irrigation/soil evidence to Kaveri's own category
labels through a small, explicit, conservative rule set — never a blind
crop-name-to-category translation. Where the evidence doesn't cleanly settle
on one of the categories Kaveri actually returned, it says so rather than
guessing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Internal normalized taxonomy (Part 9) — the original Kaveri label is always
# preserved alongside this, never replaced.
BAGAYAT_ARECANUT_VANILLA = "BAGAYAT_ARECANUT_VANILLA"
BAGAYAT_COCONUT = "BAGAYAT_COCONUT"
BAGAYAT_DRY = "BAGAYAT_DRY"
BAGAYAT_WET = "BAGAYAT_WET"
PLANTATION_RUBBER_ARECANUT = "PLANTATION_RUBBER_ARECANUT"
DRY_NO_IRRIGATION = "DRY_NO_IRRIGATION"
# Distinct from BAGAYAT_WET (garden/plantation-style irrigated cultivation —
# arecanut, coconut, etc.): Kaveri separately labels paddy-field wet
# cultivation "Wet (Assured Water Supply from Government Tanks/Canals), One/
# Two Crop" (verified live, Malalikoppa village, Hosanagar taluk) — a
# distinct real category, not a Bagayat variant.
WET_ASSURED_WATER_SUPPLY = "WET_ASSURED_WATER_SUPPLY"
OTHER_AGRICULTURAL = "OTHER_AGRICULTURAL"

_IRRIGATED_SOURCES = {
    "well", "well / tube well", "tube well", "canal", "lake", "river",
    "drip irrigation", "sprinkler",
}
_UNIRRIGATED_SOURCES = {"rainfed"}

# Crops conventionally grown as flooded/paddy-field wet cultivation, distinct
# from Bagayat (garden/plantation) wet cultivation — an agronomic fact, not a
# per-village rule.
_PADDY_FIELD_CROPS = {"paddy", "rice"}


def normalize_kaveri_label(label: str) -> str:
    n = re.sub(r"[^a-z0-9]+", " ", label.lower()).strip()
    if "arecanut" in n and ("venilla" in n or "vanilla" in n) and "plantation" not in n:
        return BAGAYAT_ARECANUT_VANILLA
    if "coconut" in n:
        return BAGAYAT_COCONUT
    if "plantation" in n and ("rubber" in n or "areca" in n):
        return PLANTATION_RUBBER_ARECANUT
    if "wet" in n and ("assured" in n or "crop" in n) and "bagayat" not in n:
        return WET_ASSURED_WATER_SUPPLY
    if "wet" in n:
        return BAGAYAT_WET
    if "dry" in n and "irrigation" in n:
        return DRY_NO_IRRIGATION
    if "dry" in n:
        return BAGAYAT_DRY
    return OTHER_AGRICULTURAL


@dataclass(frozen=True, slots=True)
class KaveriCategoryOption:
    label: str  # original Kaveri label, unmodified
    normalized: str
    rate: object
    rate_unit: str


@dataclass(frozen=True, slots=True)
class AgriCategoryResolution:
    resolved_label: str | None  # the original Kaveri label to use, or None if ambiguous
    confidence: float
    source: str  # "rtc_crop_irrigation" | "rtc_irrigation_only" | "single_category" | "unresolved"


def _evidence_normalized_targets(
    crops: list[str] | None, irrigation_source: str | None
) -> set[str]:
    """What normalized categories the RTC evidence, taken alone, plausibly
    supports. Deliberately conservative — a crop with no clean Kaveri
    counterpart contributes nothing rather than a wrong guess."""
    targets: set[str] = set()
    for crop in crops or []:
        c = crop.lower()
        if "coconut" in c:
            targets.add(BAGAYAT_COCONUT)
        elif "arecanut" in c:
            # Arecanut alone doesn't distinguish "Bagayat Arecanut & venilla"
            # from "Plantation, Rubber/Areca nut" — both are legitimate Kaveri
            # categories for the same crop at different cultivation scales;
            # RTC's crop field alone can't tell them apart, so both are
            # offered as candidates rather than picking one.
            targets.add(BAGAYAT_ARECANUT_VANILLA)
            targets.add(PLANTATION_RUBBER_ARECANUT)
        elif "rubber" in c:
            targets.add(PLANTATION_RUBBER_ARECANUT)
        elif c in _PADDY_FIELD_CROPS:
            targets.add(WET_ASSURED_WATER_SUPPLY)

    if not targets and irrigation_source:
        src = irrigation_source.lower()
        if src in _IRRIGATED_SOURCES:
            targets.add(BAGAYAT_WET)
        elif src in _UNIRRIGATED_SOURCES:
            targets.add(BAGAYAT_DRY)
            targets.add(DRY_NO_IRRIGATION)

    return targets


def resolve_agricultural_category(
    available: list[KaveriCategoryOption],
    *,
    crops: list[str] | None = None,
    irrigation_source: str | None = None,
) -> AgriCategoryResolution:
    """Pick which of the Kaveri-returned agricultural categories applies,
    using RTC crop/irrigation evidence. Never invents a category not actually
    present in `available`."""
    distinct = {o.normalized: o for o in available}
    if len(distinct) <= 1:
        only = available[0].label if available else None
        return AgriCategoryResolution(only, 0.6 if only else 0.0, "single_category")

    targets = _evidence_normalized_targets(crops, irrigation_source)
    matches = [o for o in available if o.normalized in targets]
    matched_normalized = {o.normalized for o in matches}

    if len(matched_normalized) == 1:
        source = "rtc_crop_irrigation" if crops else "rtc_irrigation_only"
        confidence = 0.9 if crops else 0.65
        return AgriCategoryResolution(matches[0].label, confidence, source)

    return AgriCategoryResolution(None, 0.0, "unresolved")
