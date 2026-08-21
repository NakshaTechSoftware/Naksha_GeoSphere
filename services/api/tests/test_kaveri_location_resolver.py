"""Tests for the generic Kaveri location resolver.

Pure + mocked-I/O only (no live Kaveri, no DB): covers the case-insensitive
key extraction that previously returned the *name* instead of the *code*
(real bug on camelCase Kaveri responses), the Bhoomi-code district match that
lets "Dakshina Kannada" resolve to Kaveri district 24 ("Mangalore") with no
hardcoded alias, and the full District->Taluk->Hobli->Village chain via both
the cached-hierarchy path and a mocked live session.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

from app.modules.pricing.kaveri_location_resolver import (
    AUTO_CONFIRM_THRESHOLD,
    PENDING_REVIEW_THRESHOLD,
    KaveriResolution,
    extract_value,
    match_level,
    normalize_name,
    resolve_in_hierarchy,
    resolve_kaveri_location,
    select_road,
    status_for_score,
)


# --- extract_value: case-insensitive, the original camelCase bug -----------

def test_extract_value_is_case_insensitive() -> None:
    item = {"districtCode": "24", "districtNamee": "Mangalore"}
    assert extract_value(item, ("districtCode",)) == "24"
    assert extract_value(item, ("DISTRICTCODE",)) == "24"
    assert extract_value(item, ("districtcode",)) == "24"


def test_extract_value_falls_back_to_first_string_field() -> None:
    item = {"someUnknownKey": "value-we-want"}
    assert extract_value(item, ("districtCode",)) == "value-we-want"


def test_extract_value_returns_empty_when_no_usable_field() -> None:
    assert extract_value({"a": None, "b": ""}, ("a", "b")) == ""


# --- normalize_name --------------------------------------------------------

def test_normalize_name_collapses_case_punctuation_and_variants() -> None:
    assert normalize_name("Belthangadi") == normalize_name("BELTHANGADI")
    assert normalize_name("Hosa-Halli") == normalize_name("Hosa Halli")
    # Generic transliteration collapse (NOT an alias): th -> t.
    assert normalize_name("Belthangadi") == normalize_name("Beltangadi")


# --- match_level: bhoomi-code + fuzzy -------------------------------------

def test_match_level_uses_bhoomi_code_over_name() -> None:
    # District name "Dakshina Kannada" would never fuzzy-match "Mangalore",
    # but the Bhoomi district code 24 does -> resolved by code, score 100,
    # and crucially returns the Kaveri code "24", not the alias.
    candidates = [{"districtCode": "24", "districtNamee": "Mangalore", "bhoomiDistrictCode": "24"}]
    result = match_level(
        "Dakshina Kannada", candidates, ("districtNamee",), bhoomi_query="24", bhoomi_key="bhoomiDistrictCode"
    )
    assert result.method == "code"
    assert result.score == 100.0
    assert result.candidate["districtCode"] == "24"


def test_match_level_fuzzy_when_no_bhoomi_hit() -> None:
    candidates = [{"talukCode": "181", "talukNamee": "Beltangadi"}]
    result = match_level("Belthangady", candidates, ("talukNamee",))
    assert result.method == "name_fuzzy"
    assert 80 <= result.score < 100  # "Belthangady" vs "Beltangadi" ~90
    assert result.candidate["talukCode"] == "181"


def test_match_level_empty_candidates() -> None:
    result = match_level("Anything", [], ("name",))
    assert result.method == "none"
    assert result.score == 0.0


# --- status bands ----------------------------------------------------------

def test_status_for_score_bands() -> None:
    assert status_for_score(100.0) == "confirmed"
    assert status_for_score(AUTO_CONFIRM_THRESHOLD) == "confirmed"
    assert status_for_score(AUTO_CONFIRM_THRESHOLD - 0.01) == "pending_review"
    assert status_for_score(PENDING_REVIEW_THRESHOLD) == "pending_review"
    assert status_for_score(PENDING_REVIEW_THRESHOLD - 0.01) == "failed"
    assert status_for_score(0.0) == "failed"


# --- Full chain: cached hierarchy (generator path) -------------------------

def _fake_hierarchy() -> object:
    """A tiny stand-in for the generator's KaveriHierarchy with the real
    camelCase keys Kaveri returns for the validated village."""

    class _H:
        districts = [{"districtCode": "24", "districtNamee": "Mangalore", "bhoomiDistrictCode": "24"}]
        taluks_by_district_code = {
            "24": [{"talukCode": "181", "talukNamee": "Beltangadi"}]
        }
        hoblis_by_taluk_code = {
            "181": [{"hoblicode": "846", "hoblinamee": "Beltangadi"}]
        }
        villages_by_hobli_code = {
            "846": [{"villagecode": "27211", "villagenamee": "Beltangadi"}]
        }

    return _H()


def test_resolve_in_hierarchy_resolves_validated_village() -> None:
    res = resolve_in_hierarchy(
        _fake_hierarchy(),
        "Dakshina Kannada",
        "Belthangady",
        "Beltangadi",
        "Beltangadi",
        "2403010001",
    )
    assert isinstance(res, KaveriResolution)
    assert res.kaveri_district_code == "24"
    assert res.kaveri_taluk_code == "181"
    assert res.kaveri_hobli_code == "846"
    assert res.kaveri_village_code == "27211"
    assert res.matched
    # District 100 (bhoomi), taluk ~90 (fuzzy), hobli/village 100 -> 90.
    assert PENDING_REVIEW_THRESHOLD <= res.confidence < AUTO_CONFIRM_THRESHOLD


def test_resolve_in_hierarchy_exact_names_gives_confirmed() -> None:
    res = resolve_in_hierarchy(
        _fake_hierarchy(),
        "Mangalore",
        "Beltangadi",
        "Beltangadi",
        "Beltangadi",
        "2403010001",
    )
    assert res.confidence >= AUTO_CONFIRM_THRESHOLD
    assert res.kaveri_village_code == "27211"


def test_resolve_in_hierarchy_low_confidence_unmatched() -> None:
    res = resolve_in_hierarchy(
        _fake_hierarchy(),
        "Nowhere District",
        "Nope Taluk",
        "Nope Hobli",
        "Nope Village",
        "9900000000",
    )
    assert res.confidence < PENDING_REVIEW_THRESHOLD


# --- Full chain: live session (endpoint path) ------------------------------

async def test_resolve_kaveri_location_live_chain() -> None:
    session = AsyncMock()
    session.get_districts = AsyncMock(return_value=[{"districtCode": "24", "districtNamee": "Mangalore", "bhoomiDistrictCode": "24"}])
    session.get_taluks = AsyncMock(return_value=[{"talukCode": "181", "talukNamee": "Beltangadi"}])
    session.get_hoblis = AsyncMock(return_value=[{"hoblicode": "846", "hoblinamee": "Beltangadi"}])
    session.get_villages = AsyncMock(return_value=[{"villagecode": "27211", "villagenamee": "Beltangadi"}])

    res = await resolve_kaveri_location(session, "Dakshina Kannada", "Belthangady", "Beltangadi", "Beltangadi", "2403010001")
    assert res.kaveri_village_code == "27211"
    assert res.kaveri_district_code == "24"
    # Only the needed path was fetched, not the whole state tree.
    session.get_taluks.assert_awaited_once_with("24")
    session.get_hoblis.assert_awaited_once_with("181")
    session.get_villages.assert_awaited_once_with("846")


# --- select_road: no blind roads[0] ----------------------------------------

def test_select_road_prefers_village_name_match() -> None:
    roads = [
        {"roadcode": "1", "roadnamee": "Some Other Road"},
        {"roadcode": "2", "roadnamee": "Beltangadi Village"},
    ]
    code, name, choices = select_road(roads, village_name="Beltangadi")
    assert code == "2"
    assert name == "Beltangadi Village"
    assert choices[0][0] == "2"


def test_select_road_uses_parcel_road_attribute() -> None:
    roads = [
        {"roadcode": "1", "roadnamee": "Main Road"},
        {"roadcode": "2", "roadnamee": "Beltangadi Village"},
    ]
    code, _name, _choices = select_road(roads, village_name="Beltangadi", parcel_road="Main Road")
    assert code == "1"


def test_select_road_empty() -> None:
    code, name, choices = select_road([], village_name="X")
    assert code is None
    assert choices == []
