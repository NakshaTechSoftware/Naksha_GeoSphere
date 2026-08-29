"""Feature 2 — /geoai/query-layer."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.database.postgres import get_db_session
from app.main import app
from app.schemas.geoai_models import SpatialFeature


@pytest.fixture(autouse=True)
def _override_db_session():
    async def _fake_session():
        yield None

    app.dependency_overrides[get_db_session] = _fake_session
    yield
    app.dependency_overrides.pop(get_db_session, None)


def test_query_layer_returns_feature(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_query_layer = AsyncMock(
        return_value=(SpatialFeature(name="Bangalore Urban", id="KA_BLR_001"), "minio_geojson")
    )
    monkeypatch.setattr("app.api.spatial_query.query_layer", mock_query_layer)

    resp = client.post(
        "/geoai/query-layer",
        headers=auth_headers,
        json={"layer": "district", "point": [77.59, 12.97]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["feature"]["name"] == "Bangalore Urban"
    mock_query_layer.assert_awaited_once()


def test_query_layer_rejects_unknown_layer_shape(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.post(
        "/geoai/query-layer",
        headers=auth_headers,
        json={"layer": "district", "point": [77.59]},  # missing latitude
    )
    assert resp.status_code == 422
