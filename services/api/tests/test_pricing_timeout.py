"""Proves the guideline-value endpoint's overall request ceiling actually
cuts off a hung resolution instead of leaving the request pending forever
(spec: "no request may remain indefinitely pending").

Does not stand up a real DB session — `_resolve_guideline_value` is patched
out entirely, so this only exercises the timeout wrapper in
`get_guideline_value` itself.
"""

from __future__ import annotations

import asyncio

import pytest

from app.api.v1 import pricing
from app.modules.pricing.schemas import GuidelineValueUnavailableReason


async def test_get_guideline_value_returns_timeout_when_resolution_hangs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pricing, "OVERALL_REQUEST_TIMEOUT_SECONDS", 0.05)

    async def _hangs(**kwargs: object) -> None:
        await asyncio.sleep(10)

    monkeypatch.setattr(pricing, "_resolve_guideline_value", _hangs)

    result = await pricing.get_guideline_value(
        kgis_village_code="0000000000",
        plot_area_sqm=100.0,
        district=None,
        taluk=None,
        hobli=None,
        village=None,
        road=None,
        category=None,
        landcode=None,
        bhoomi_land_classification=None,
        bhoomi_crop=None,
        bhoomi_irrigation=None,
        session=None,  # type: ignore[arg-type]
    )

    assert result.status == "unavailable"
    assert result.reason == GuidelineValueUnavailableReason.KAVERI_TIMEOUT


async def test_get_guideline_value_passes_through_fast_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pricing, "OVERALL_REQUEST_TIMEOUT_SECONDS", 5.0)

    sentinel = pricing.GuidelineValueUnavailableResponse(
        reason=GuidelineValueUnavailableReason.MAPPING_MISSING, message="test"
    )

    async def _fast(**kwargs: object) -> pricing.GuidelineValueUnavailableResponse:
        return sentinel

    monkeypatch.setattr(pricing, "_resolve_guideline_value", _fast)

    result = await pricing.get_guideline_value(
        kgis_village_code="0000000000",
        plot_area_sqm=100.0,
        district=None,
        taluk=None,
        hobli=None,
        village=None,
        road=None,
        category=None,
        landcode=None,
        bhoomi_land_classification=None,
        bhoomi_crop=None,
        bhoomi_irrigation=None,
        session=None,  # type: ignore[arg-type]
    )

    assert result is sentinel
