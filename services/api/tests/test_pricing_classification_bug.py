"""Regression test for the core classification bug: a lone Kaveri rate on a
resolved road must never be treated as proof of the parcel's classification.

Drives the real `_resolve_guideline_value` orchestration with the DB
repository and Kaveri session both faked out, so this exercises the actual
decision logic (not just the classification resolver in isolation).
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.api.v1 import pricing


class _FakeMapping:
    kgis_village_code = "2405020005"
    kaveri_village_code = "999"
    kaveri_district_code = "1"
    kaveri_taluk_code = "2"
    kaveri_hobli_code = "3"
    village_name = "Balagodu"

    class mapping_status:
        value = "confirmed"


class _FakeRepo:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    async def get_mapping_by_kgis_code(self, _kgis_code: str) -> _FakeMapping:
        return _FakeMapping()

    async def get_fresh_rate_entries_for_road(self, *_args: object) -> None:
        return None

    async def upsert_rate_cache_bulk(self, *_args: object, **_kwargs: object) -> None:
        return None

    async def upsert_rate_cache(self, *_args: object, **_kwargs: object) -> None:
        return None

    async def rollback(self) -> None:
        return None

    async def commit(self) -> None:
        return None


class _FakeKaveriSession:
    async def __aenter__(self) -> "_FakeKaveriSession":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def get_roads(self, _village_code: str) -> list[dict]:
        return [{"roadcode": "1", "roadnamee": "Balagodu"}]

    async def get_agricultural_rate(self, _road_code: str) -> list[dict]:
        return []  # Kaveri has no agricultural data for this road/locality

    async def get_vacant_rate(self, _road_code: str) -> list[dict]:
        # Kaveri's ONLY category here is Residential - this must not be
        # read as "the parcel is Residential".
        return [{"propertytypename": "Residential", "rate": 1300, "openbuildratecode": 1}]

    async def get_villages(self, _hobli_code: str) -> list[dict]:
        return []  # no sibling villages to consider in this fixture


@pytest.fixture(autouse=True)
def _patch_pricing_deps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pricing, "KaveriPricingRepository", _FakeRepo)
    monkeypatch.setattr(pricing, "KaveriSession", _FakeKaveriSession)


async def test_single_residential_rate_with_unknown_classification_requires_selection() -> None:
    """Real Balagodu-shaped scenario: RTC hasn't resolved yet (no
    bhoomi_land_classification), GIS Category is generic ("Parcel"), and the
    resolved road's ONLY Kaveri category is Residential. The endpoint must
    return classification_required with that candidate — never a computed
    'ok' Residential guideline value."""
    result = await pricing._resolve_guideline_value(
        kgis_village_code="2405020005",
        plot_area_sqm=67988.426,
        district="Dakshina Kannada",
        taluk="Sullia",
        hobli="Panja",
        village="Balagodu",
        road=None,
        category="Parcel",
        landcode=None,
        bhoomi_land_classification=None,
        bhoomi_crop=None,
        bhoomi_irrigation=None,
        session=MagicMock(),
    )
    assert result.status == "classification_unknown"
    assert any(c.property_type == "Residential" for c in result.candidates)


async def test_bhoomi_agriculture_is_never_overridden_by_a_residential_kaveri_rate() -> None:
    """Once RTC actually resolves to Agriculture, the endpoint must use the
    agricultural path — even though Kaveri's only non-agricultural category
    on this road is Residential, that must never leak into the result."""
    result = await pricing._resolve_guideline_value(
        kgis_village_code="2405020005",
        plot_area_sqm=67988.426,
        district="Dakshina Kannada",
        taluk="Sullia",
        hobli="Panja",
        village="Balagodu",
        road=None,
        category="Parcel",
        landcode=None,
        bhoomi_land_classification="Agriculture",
        bhoomi_crop=None,
        bhoomi_irrigation=None,
        session=MagicMock(),
    )
    # No agricultural rate exists on this fake road at all (see
    # _FakeKaveriSession.get_agricultural_rate) - the correct outcome is a
    # genuine "not found" for agriculture, NEVER a fallback to Residential.
    assert result.status == "unavailable"
    assert result.reason.value == "agricultural_rate_not_found"
