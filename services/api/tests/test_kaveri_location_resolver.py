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
    find_sibling_villages,
    match_level,
    normalize_name,
    resolve_in_hierarchy,
    resolve_kaveri_location,
    resolve_kaveri_location_debug,
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


# --- Hierarchical hobli disambiguation: unique village overrides weak hobli
# name match (real live case: KGIS "Huncha" vs Kaveri "Humcha Hobli",
# Shivamogga/Hosanagar/Malalikoppa, hobli similarity 75 -> previously failed
# outright at "mapping_missing: low confidence=75.0" even though district,
# taluk, and village were all exact). Village codes/names below are
# synthetic stand-ins for the same shape, not the real Kaveri data itself. ---

def _fake_hierarchy_multi_hobli(village_in_second_hobli_too: bool = False) -> object:
    class _H:
        # bhoomiDistrictCode "15" matches the leading two digits of the KGIS
        # village code "1504040025" used below, so district resolves via the
        # Bhoomi-code shortcut (score 100) exactly like the live portal does -
        # "Shivamogga" (KGIS spelling) vs "Shimoga" (Kaveri spelling) would
        # otherwise fuzzy-match below 100 and isn't what's under test here.
        districts = [{"districtCode": "28", "districtNamee": "Shimoga", "bhoomiDistrictCode": "15"}]
        taluks_by_district_code = {"28": [{"talukCode": "156", "talukNamee": "Hosanagar"}]}
        hoblis_by_taluk_code = {
            "156": [
                {"hoblicode": "680", "hoblinamee": "Humcha Hobli"},
                {"hoblicode": "679", "hoblinamee": "Kasaba Hobli"},
                {"hoblicode": "681", "hoblinamee": "Nagara Hobli"},
            ]
        }
        villages_by_hobli_code = {
            "680": [{"villagecode": "22199", "villagenamee": "Malalikoppa"}],
            "679": (
                [{"villagecode": "99001", "villagenamee": "Malalikoppa"}]
                if village_in_second_hobli_too
                else [{"villagecode": "99001", "villagenamee": "Jala"}]
            ),
            "681": [{"villagecode": "99002", "villagenamee": "Malali"}],
        }

    return _H()


def test_unique_village_overrides_weak_hobli_name_match() -> None:
    res = resolve_in_hierarchy(
        _fake_hierarchy_multi_hobli(), "Shivamogga", "Hosanagar", "Huncha", "Malalikoppa", "1504040025"
    )
    assert res.kaveri_hobli_code == "680"
    assert res.kaveri_village_code == "22199"
    assert res.matched
    assert res.confidence >= AUTO_CONFIRM_THRESHOLD


def test_village_ambiguous_across_multiple_hoblis_stays_pending_review() -> None:
    res = resolve_in_hierarchy(
        _fake_hierarchy_multi_hobli(village_in_second_hobli_too=True),
        "Shivamogga", "Hosanagar", "Huncha", "Malalikoppa", "1504040025",
    )
    assert PENDING_REVIEW_THRESHOLD <= res.confidence < AUTO_CONFIRM_THRESHOLD


def test_unique_village_override_not_triggered_when_hobli_already_matches_well() -> None:
    # Hobli name matches cleanly on its own - the override path (which would
    # otherwise ignore hobli-name evidence entirely) must not run/interfere.
    res = resolve_in_hierarchy(
        _fake_hierarchy_multi_hobli(), "Shivamogga", "Hosanagar", "Humcha Hobli", "Malalikoppa", "1504040025"
    )
    assert res.kaveri_hobli_code == "680"
    assert res.confidence >= AUTO_CONFIRM_THRESHOLD


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


async def test_resolve_kaveri_location_disambiguates_weak_hobli_live() -> None:
    """Live-session equivalent of the Malalikoppa case: hobli name match is
    weak (75, below AUTO_CONFIRM), so the resolver must fan out to every
    hobli under the taluk and find the unique village — proving the extra
    `get_villages` calls only happen in this (rare) circumstance."""
    session = AsyncMock()
    session.get_districts = AsyncMock(
        return_value=[{"districtCode": "28", "districtNamee": "Shimoga", "bhoomiDistrictCode": "15"}]
    )
    session.get_taluks = AsyncMock(return_value=[{"talukCode": "156", "talukNamee": "Hosanagar"}])
    session.get_hoblis = AsyncMock(
        return_value=[
            {"hoblicode": "680", "hoblinamee": "Humcha Hobli"},
            {"hoblicode": "679", "hoblinamee": "Kasaba Hobli"},
        ]
    )

    async def fake_get_villages(hobli_code: str) -> list[dict]:
        return {
            "680": [{"villagecode": "22199", "villagenamee": "Malalikoppa"}],
            "679": [{"villagecode": "99001", "villagenamee": "Jala"}],
        }[hobli_code]

    session.get_villages = AsyncMock(side_effect=fake_get_villages)

    res = await resolve_kaveri_location(session, "Shivamogga", "Hosanagar", "Huncha", "Malalikoppa", "1504040025")
    assert res.kaveri_hobli_code == "680"
    assert res.kaveri_village_code == "22199"
    assert res.confidence >= AUTO_CONFIRM_THRESHOLD
    # Fanned out to every hobli under the taluk, not just the best fuzzy guess.
    assert session.get_villages.await_count == 2


async def test_resolve_kaveri_location_skips_fanout_when_hobli_already_confident() -> None:
    """The extra per-hobli fetches must NOT happen when the hobli name
    already matches cleanly - this is the common case and must stay cheap."""
    session = AsyncMock()
    session.get_districts = AsyncMock(return_value=[{"districtCode": "24", "districtNamee": "Mangalore"}])
    session.get_taluks = AsyncMock(return_value=[{"talukCode": "181", "talukNamee": "Beltangadi"}])
    session.get_hoblis = AsyncMock(
        return_value=[
            {"hoblicode": "846", "hoblinamee": "Beltangadi Hobli"},
            {"hoblicode": "845", "hoblinamee": "Kokkada Hobli"},
        ]
    )
    session.get_villages = AsyncMock(return_value=[{"villagecode": "27211", "villagenamee": "Beltangadi"}])

    await resolve_kaveri_location(session, "Dakshina Kannada", "Beltangadi", "Beltangadi Hobli", "Beltangadi", "2403010001")
    session.get_villages.assert_awaited_once_with("846")


# --- Alternate-taluk retry: KGIS "hobli" is actually a Kaveri taluk --------
# (real live case: Hassan/Channarayapatna/Nuggehalli/Basavanapura — Kaveri
# lists "Nuggehalli" as its OWN taluk, not a hobli under Channarayapatna, and
# Basavanapura doesn't exist anywhere under Channarayapatna at all.)

async def test_resolve_kaveri_location_retries_hobli_as_alternate_taluk_unique() -> None:
    session = AsyncMock()
    session.get_districts = AsyncMock(return_value=[{"districtCode": "19", "districtNamee": "Hassan"}])
    session.get_taluks = AsyncMock(
        return_value=[
            {"talukCode": "67", "talukNamee": "Channarayapatna"},
            {"talukCode": "70", "talukNamee": "Nuggehalli"},
        ]
    )

    async def fake_get_hoblis(taluk_code: str) -> list[dict]:
        return {
            "67": [{"hoblicode": "284", "hoblinamee": "Dandiganahalli Hobli"}],
            "70": [{"hoblicode": "295", "hoblinamee": "Bagur Hobli"}],
        }[taluk_code]

    async def fake_get_villages(hobli_code: str) -> list[dict]:
        return {
            "284": [{"villagecode": "99001", "villagenamee": "Narayanapura"}],
            "295": [{"villagecode": "12324", "villagenamee": "Basavanapura"}],
        }[hobli_code]

    session.get_hoblis = AsyncMock(side_effect=fake_get_hoblis)
    session.get_villages = AsyncMock(side_effect=fake_get_villages)

    res = await resolve_kaveri_location(
        session, "Hassan", "Channarayapatna", "Nuggehalli", "Basavanapura", "2308160036"
    )
    assert res.kaveri_taluk_code == "70"
    assert res.kaveri_hobli_code == "295"
    assert res.kaveri_village_code == "12324"
    assert res.confidence >= AUTO_CONFIRM_THRESHOLD


async def test_resolve_kaveri_location_alternate_taluk_duplicate_village_stays_pending_review() -> None:
    session = AsyncMock()
    session.get_districts = AsyncMock(return_value=[{"districtCode": "19", "districtNamee": "Hassan"}])
    session.get_taluks = AsyncMock(
        return_value=[
            {"talukCode": "67", "talukNamee": "Channarayapatna"},
            {"talukCode": "70", "talukNamee": "Nuggehalli"},
        ]
    )

    async def fake_get_hoblis(taluk_code: str) -> list[dict]:
        return {
            "67": [{"hoblicode": "284", "hoblinamee": "Dandiganahalli Hobli"}],
            "70": [
                {"hoblicode": "295", "hoblinamee": "Bagur Hobli"},
                {"hoblicode": "293", "hoblinamee": "Nugeehalli Hobli"},
            ],
        }[taluk_code]

    async def fake_get_villages(hobli_code: str) -> list[dict]:
        return {
            "284": [{"villagecode": "99001", "villagenamee": "Narayanapura"}],
            "295": [{"villagecode": "12324", "villagenamee": "Basavanapura"}],
            "293": [{"villagecode": "11395", "villagenamee": "Basavanapura"}],
        }[hobli_code]

    session.get_hoblis = AsyncMock(side_effect=fake_get_hoblis)
    session.get_villages = AsyncMock(side_effect=fake_get_villages)

    res = await resolve_kaveri_location(
        session, "Hassan", "Channarayapatna", "Nuggehalli", "Basavanapura", "2308160036"
    )
    # Genuinely ambiguous (two real villages of the same name in the correct
    # taluk) - must never be silently auto-confirmed either way.
    assert PENDING_REVIEW_THRESHOLD <= res.confidence < AUTO_CONFIRM_THRESHOLD
    assert res.kaveri_taluk_code == "70"
    assert res.kaveri_village_code in ("12324", "11395")


async def test_resolve_kaveri_location_no_alternate_taluk_stays_low_confidence() -> None:
    """No village match anywhere, and the KGIS hobli name doesn't correspond
    to any other real taluk either - must fall through to the original
    (low-confidence) result, not fabricate a match."""
    session = AsyncMock()
    session.get_districts = AsyncMock(return_value=[{"districtCode": "19", "districtNamee": "Hassan"}])
    session.get_taluks = AsyncMock(
        return_value=[{"talukCode": "67", "talukNamee": "Channarayapatna"}]
    )
    session.get_hoblis = AsyncMock(
        return_value=[{"hoblicode": "284", "hoblinamee": "Dandiganahalli Hobli"}]
    )
    session.get_villages = AsyncMock(return_value=[{"villagecode": "99001", "villagenamee": "Narayanapura"}])

    res = await resolve_kaveri_location(
        session, "Hassan", "Channarayapatna", "Nonexistent Hobli", "No Such Village", "2308160036"
    )
    assert res.confidence < PENDING_REVIEW_THRESHOLD


# --- select_road: no blind roads[0], confidence + method --------------------

def test_select_road_prefers_village_name_match() -> None:
    roads = [
        {"roadcode": "1", "roadnamee": "Some Other Road"},
        {"roadcode": "2", "roadnamee": "Beltangadi Village"},
    ]
    res = select_road(roads, village_name="Beltangadi")
    assert res.road_code == "2"
    assert res.road_name == "Beltangadi Village"
    assert res.method == "locality_name_match"
    assert res.ranked[0].code == "2"


def test_select_road_uses_parcel_road_attribute() -> None:
    roads = [
        {"roadcode": "1", "roadnamee": "Main Road"},
        {"roadcode": "2", "roadnamee": "Beltangadi Village"},
    ]
    res = select_road(roads, village_name="Beltangadi", parcel_road="Main Road")
    assert res.road_code == "1"
    assert res.method == "exact_road_attribute"
    assert res.confidence >= 0.9


def test_select_road_empty() -> None:
    res = select_road([], village_name="X")
    assert res.road_code is None
    assert res.ranked == []
    assert not res.resolved


def test_select_road_single_candidate_is_village_default() -> None:
    roads = [{"roadcode": "1", "roadnamee": "Main Road"}]
    res = select_road(roads, village_name="Somevillage")
    assert res.road_code == "1"
    assert res.method == "village_default"
    assert res.confidence < 0.6


def test_select_road_avoids_apartment_entry_without_explicit_match() -> None:
    roads = [
        {"roadcode": "1", "roadnamee": "Main Road"},
        {"roadcode": "2", "roadnamee": "Village Flat/Apartment"},
    ]
    res = select_road(roads, village_name="Village")
    # "Village Flat/Apartment" would win on raw name similarity, but the
    # apartment-only entry must not be preferred over an actual named road.
    assert res.road_code == "1"


# --- find_sibling_villages: real Kaveri "empty placeholder + Town record" --
# pattern (verified live 2026-08-24: Dakshina Kannada / Beltangadi taluk /
# Beltangadi Hobli has village 27211 "Beltangadi", a genuinely empty
# administrative record with one rateless road, and a separate village 26024
# "Beltangadi Town" in the same hobli carrying the real published SR rates).

def test_find_sibling_villages_matches_town_suffix_in_same_hobli() -> None:
    hobli_villages = [
        {"villagecode": "27211", "villagenamee": "Beltangadi"},
        {"villagecode": "26024", "villagenamee": "Beltangadi Town"},
        {"villagecode": "26526", "villagenamee": "Charmadi"},
    ]
    siblings = find_sibling_villages("Beltangadi", hobli_villages, "27211")
    assert [s.code for s in siblings] == ["26024"]
    assert siblings[0].name == "Beltangadi Town"


def test_find_sibling_villages_excludes_self_and_unrelated_names() -> None:
    hobli_villages = [
        {"villagecode": "1", "villagenamee": "Somevillage"},
        {"villagecode": "2", "villagenamee": "Charmadi"},
    ]
    assert find_sibling_villages("Somevillage", hobli_villages, "1") == []


def test_find_sibling_villages_empty_when_no_candidates() -> None:
    assert find_sibling_villages("Beltangadi", [], "27211") == []


# --- Regression: the three real Karnataka-wide failures (synthetic shapes) ---
# These mirror the *structure* of the live failures fixed by the taluk-wide
# village fan-out (no hardcoded village codes/aliases anywhere): a weak hobli
# name match, an empty Kaveri hobli, and an exact-normalize village match.

def _fake_session_dharwad_kundgol_sanshi_yarebhudihala() -> AsyncMock:
    """CASE A shape: Dharwad/Kundgol/Sanshi/"Yare Bhudhihala". The KGIS hobli
    "Sanshi" fuzzy-matches Kaveri "Samshi Hobli" (weak), and the village
    "Yare Bhudhihala" lives there as "Yarebodihala" - unique across the taluk."""
    session = AsyncMock()
    session.get_districts = AsyncMock(
        return_value=[{"districtCode": "16", "districtNamee": "Dharwad", "bhoomiDistrictCode": "9"}]
    )
    session.get_taluks = AsyncMock(
        return_value=[{"talukCode": "202", "talukNamee": "Kundagol"}]
    )
    session.get_hoblis = AsyncMock(
        return_value=[
            {"hoblicode": "974", "hoblinamee": "Samshi Hobli"},
            {"hoblicode": "987", "hoblinamee": "Kundagol Hobli"},
            {"hoblicode": "988", "hoblinamee": "Kundagola Town"},
        ]
    )

    async def fake_get_villages(hobli_code: str) -> list[dict]:
        return {
            "974": [{"villagecode": "31942", "villagenamee": "Yarebodihala"}],
            "987": [{"villagecode": "31965", "villagenamee": "Yalivela"}],
            "988": [],
        }[hobli_code]

    session.get_villages = AsyncMock(side_effect=fake_get_villages)
    return session


async def test_case_a_yare_bhudihala_resolves_unique_in_taluk() -> None:
    session = _fake_session_dharwad_kundgol_sanshi_yarebhudihala()
    res = await resolve_kaveri_location(
        session, "Dharwad", "Kundgol", "Sanshi", "Yare Bhudhihala", "0905020003"
    )
    assert res.kaveri_village_code == "31942"
    assert res.kaveri_hobli_code == "974"
    assert res.method == "unique_village_within_taluk"
    assert PENDING_REVIEW_THRESHOLD <= res.confidence < AUTO_CONFIRM_THRESHOLD


async def test_case_b_yaliwala_resolves_in_kundagol_hobli() -> None:
    """CASE B shape: Dharwad/Kundgol/Kundagola/"Yaliwala". The KGIS hobli
    "Kundagola" matches "Kundagol Hobli", and the village "Yaliwala" maps to
    "Yalivela" there (v/w->b fuzzy). The empty "Kundagola Town" hobli must not
    blind the search."""
    session = _fake_session_dharwad_kundgol_sanshi_yarebhudihala()
    res = await resolve_kaveri_location(
        session, "Dharwad", "Kundgol", "Kundagola", "Yaliwala", "0905010004"
    )
    assert res.kaveri_village_code == "31965"
    assert res.kaveri_hobli_code == "987"
    assert res.method == "unique_village_within_taluk"
    assert PENDING_REVIEW_THRESHOLD <= res.confidence < AUTO_CONFIRM_THRESHOLD


def _fake_session_dharwad_kalgatgi_hulaginakatti() -> AsyncMock:
    """CASE C shape: Dharwad/Kalgatgi/Kalaghatagi/"Hulaginakatti" -> exact
    normalize match "Hulagina Katti" (31567). The village resolves; whether
    Kaveri then publishes roads/rates for it is a separate (road) concern."""
    session = AsyncMock()
    session.get_districts = AsyncMock(
        return_value=[{"districtCode": "16", "districtNamee": "Dharwad", "bhoomiDistrictCode": "9"}]
    )
    session.get_taluks = AsyncMock(
        return_value=[{"talukCode": "201", "talukNamee": "Kalghatagi"}]
    )
    session.get_hoblis = AsyncMock(
        return_value=[{"hoblicode": "973", "hoblinamee": "Kalghatagi Hobli"}]
    )
    session.get_villages = AsyncMock(
        return_value=[{"villagecode": "31567", "villagenamee": "Hulagina Katti"}]
    )
    return session


async def test_case_c_hulaginakatti_exact_normalize_match() -> None:
    session = _fake_session_dharwad_kalgatgi_hulaginakatti()
    res = await resolve_kaveri_location(
        session, "Dharwad", "Kalgatgi", "Kalaghatagi", "Hulaginakatti", "0904010003"
    )
    assert res.kaveri_village_code == "31567"
    assert res.kaveri_hobli_code == "973"
    assert res.matched
    assert res.village_score >= 95.0


async def test_resolve_kaveri_location_debug_returns_trace() -> None:
    """Dev-only diagnostic wrapper must surface the decision trace without
    changing resolution behaviour."""
    session = _fake_session_dharwad_kundgol_sanshi_yarebhudihala()
    out = await resolve_kaveri_location_debug(
        session, "Dharwad", "Kundgol", "Sanshi", "Yare Bhudhihala", "0905020003"
    )
    assert "resolution" in out and "trace" in out
    assert out["resolution"]["kaveri_village_code"] == "31942"
    assert "village_search" in out["trace"]
    assert "district_candidates" in out["trace"]
    assert "taluk_candidates" in out["trace"]
    assert "hobli_candidates" in out["trace"]
