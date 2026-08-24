"""Tests for the agricultural rate-category resolver.

Fixtures use the real Kaveri category labels observed live (2026-08-24,
Odilnal village, Dakshina Kannada) so the taxonomy mapping is grounded in
actual data, not invented labels.
"""

from __future__ import annotations

from decimal import Decimal

from app.modules.pricing.agricultural_category import (
    BAGAYAT_ARECANUT_VANILLA,
    BAGAYAT_COCONUT,
    BAGAYAT_DRY,
    BAGAYAT_WET,
    DRY_NO_IRRIGATION,
    PLANTATION_RUBBER_ARECANUT,
    WET_ASSURED_WATER_SUPPLY,
    KaveriCategoryOption,
    normalize_kaveri_label,
    resolve_agricultural_category,
)

ODILNAL_MAIN_ROAD = [
    ("Bagayat, Dry", 500000),
    ("Bagayat, Wet", 550000),
    ("Plantation, Rubber/Areca nut", 800000),
    ("Bagayat Coconut", 700000),
    ("Bagayat Arecanut & venilla", 800000),
]


def _options(pairs=ODILNAL_MAIN_ROAD) -> list[KaveriCategoryOption]:
    return [
        KaveriCategoryOption(label=label, normalized=normalize_kaveri_label(label), rate=Decimal(rate), rate_unit="per_acre")
        for label, rate in pairs
    ]


# --- normalize_kaveri_label: real live labels -------------------------------

def test_normalize_kaveri_label_maps_real_live_labels() -> None:
    assert normalize_kaveri_label("Bagayat, Dry") == BAGAYAT_DRY
    assert normalize_kaveri_label("Bagayat, Wet") == BAGAYAT_WET
    assert normalize_kaveri_label("Bagayat Coconut") == BAGAYAT_COCONUT
    assert normalize_kaveri_label("Bagayat Arecanut & venilla") == BAGAYAT_ARECANUT_VANILLA
    assert normalize_kaveri_label("Plantation, Rubber/Areca nut") == PLANTATION_RUBBER_ARECANUT
    assert normalize_kaveri_label("Dry, No Source of Irrigation, Black Soil") == DRY_NO_IRRIGATION
    assert (
        normalize_kaveri_label("Wet (Assured Water Supply from Government Tanks/Canals), One Crop")
        == WET_ASSURED_WATER_SUPPLY
    )


# --- resolve_agricultural_category: no blind entries[0] ---------------------

def test_no_evidence_returns_unresolved_not_a_guess() -> None:
    res = resolve_agricultural_category(_options())
    assert res.resolved_label is None
    assert res.source == "unresolved"


def test_coconut_crop_resolves_unambiguously() -> None:
    res = resolve_agricultural_category(_options(), crops=["Coconut"])
    assert res.resolved_label == "Bagayat Coconut"
    assert res.source == "rtc_crop_irrigation"
    assert res.confidence >= 0.8


def test_arecanut_crop_alone_stays_ambiguous_between_bagayat_and_plantation() -> None:
    # Arecanut legitimately maps to two different real Kaveri categories at
    # different cultivation scales - RTC crop name alone can't tell them
    # apart, so this must NOT silently pick one.
    res = resolve_agricultural_category(_options(), crops=["Arecanut"])
    assert res.resolved_label is None


def test_rubber_crop_resolves_to_plantation() -> None:
    res = resolve_agricultural_category(_options(), crops=["Rubber"])
    assert res.resolved_label == "Plantation, Rubber/Areca nut"


def test_irrigation_source_disambiguates_wet_vs_dry_when_no_crop() -> None:
    res = resolve_agricultural_category(_options(), irrigation_source="Well / Tube Well")
    assert res.resolved_label == "Bagayat, Wet"
    assert res.source == "rtc_irrigation_only"


def test_rainfed_irrigation_still_ambiguous_between_two_dry_categories() -> None:
    # "Bagayat, Dry" and "Dry, No Source of Irrigation, Black Soil" both
    # plausibly match "rainfed" - real ambiguity, must not be guessed, when
    # BOTH are actually available on the road (verified live: the Town
    # Panchayath locality returns "Dry, No Source of Irrigation, Black Soil"
    # instead of "Bagayat, Dry").
    pairs = ODILNAL_MAIN_ROAD + [("Dry, No Source of Irrigation, Black Soil", 600000)]
    res = resolve_agricultural_category(_options(pairs), irrigation_source="Rainfed")
    assert res.resolved_label is None


def test_single_category_available_is_used_without_needing_evidence() -> None:
    res = resolve_agricultural_category(_options([("Bagayat, Wet", 650000)]))
    assert res.resolved_label == "Bagayat, Wet"
    assert res.source == "single_category"


def test_unrelated_crop_contributes_no_evidence() -> None:
    res = resolve_agricultural_category(_options(), crops=["Ragi"])
    assert res.resolved_label is None


# --- Malalikoppa live fixture: paddy vs Bagayat-wet disambiguation ----------

MALALIKOPPA_MAIN_ROAD = [
    ("Dry, No Source of Irrigation,Other", 210000),
    ("Bagayat, Wet", 1050000),
    ("Wet (Assured Water Supply from Government Tanks/Canals), One Crop", 260000),
    ("Plantation, Rubber/Areca nut", 780000),
]


def test_paddy_crop_resolves_to_assured_water_supply_not_bagayat_wet() -> None:
    # Paddy is flooded-field cultivation, a distinct real Kaveri category
    # from Bagayat's garden/plantation-style "wet" (arecanut/coconut, etc.) -
    # must not collapse into the wrong "wet" bucket.
    res = resolve_agricultural_category(_options(MALALIKOPPA_MAIN_ROAD), crops=["Paddy", "Green Gram"])
    assert res.resolved_label == "Wet (Assured Water Supply from Government Tanks/Canals), One Crop"
    assert res.source == "rtc_crop_irrigation"


def test_green_gram_alone_contributes_no_evidence() -> None:
    res = resolve_agricultural_category(_options(MALALIKOPPA_MAIN_ROAD), crops=["Green Gram"])
    assert res.resolved_label is None
