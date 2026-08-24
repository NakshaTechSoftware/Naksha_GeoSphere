"""Tests for the parcel land-classification resolver.

The core acceptance rule under test throughout this module: Kaveri rate
*availability* must never stand in for parcel *classification* evidence —
a lone Residential rate on a resolved road proves nothing about what the
clicked parcel actually is.
"""

from __future__ import annotations

from app.modules.pricing.classification import resolve_land_classification


def test_no_evidence_at_all_is_unknown_not_residential() -> None:
    res = resolve_land_classification()
    assert res.classification == "unknown"
    assert res.confidence == 0.0


def test_bhoomi_agriculture_wins_regardless_of_gis_hints() -> None:
    res = resolve_land_classification(bhoomi_land_classification="Agriculture", category="Parcel")
    assert res.classification == "agricultural"
    assert res.source == "bhoomi_rtc"


def test_invalid_bhoomi_hissa_with_no_other_evidence_stays_unknown() -> None:
    # "Invalid-Not having in Bhoomi" is not itself passed as a classification
    # string (the frontend only forwards `landClassification` once RTC
    # resolves one) - simulates the case where no RTC evidence exists yet.
    res = resolve_land_classification(bhoomi_land_classification=None, category="Parcel", landcode=None)
    assert res.classification == "unknown"


def test_bhoomi_forest_is_not_forced_into_agricultural_or_residential() -> None:
    res = resolve_land_classification(bhoomi_land_classification="Reserved Forest")
    assert res.classification == "forest"
    assert res.classification not in ("agricultural", "non_agricultural")


def test_gis_government_land_keyword_detected() -> None:
    res = resolve_land_classification(category="Government Land - Gomal")
    assert res.classification == "government_land"


def test_gis_waterbody_keyword_detected() -> None:
    res = resolve_land_classification(landcode="Kere / Tank")
    assert res.classification == "waterbody"


def test_bare_category_parcel_with_no_keywords_stays_unknown() -> None:
    # Real live example (Balagodu Survey 75/Hissa 1): Category="Parcel",
    # Landcode absent - neither is meaningful evidence of anything.
    res = resolve_land_classification(category="Parcel", landcode=None)
    assert res.classification == "unknown"


def test_bhoomi_residential_is_real_evidence_not_a_kaveri_rate_echo() -> None:
    # Contrast case: THIS is what legitimate Residential evidence looks like
    # - an actual Bhoomi/RTC classification string, never Kaveri's rate list.
    res = resolve_land_classification(bhoomi_land_classification="Residential")
    assert res.classification == "non_agricultural"
    assert res.subtype == "residential"
    assert res.source == "bhoomi_rtc"
