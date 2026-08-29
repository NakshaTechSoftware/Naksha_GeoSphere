"""Feature 1 — /geoai/nearby.

The PostGIS query itself (nearby_service._query_postgis) needs a real
PostGIS connection to verify meaningfully — that's covered separately by
tests/test_nearby_integration.py, skipped unless TEST_DATABASE_URL is set.
Here we verify the HTTP contract: auth, validation, caching, and that the
endpoint calls find_nearby with the right arguments.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.database.postgres import get_db_session
from app.main import app
from app.schemas.geoai_models import LatLon, NearbyResultItem


@pytest.fixture(autouse=True)
def _override_db_session():
    async def _fake_session():
        yield None

    app.dependency_overrides[get_db_session] = _fake_session
    yield
    app.dependency_overrides.pop(get_db_session, None)


def test_nearby_requires_auth(client: TestClient) -> None:
    resp = client.post("/geoai/nearby", json={"type": "police_station", "lat": 12.97, "lon": 77.59})
    assert resp.status_code == 401


def test_nearby_returns_results(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_result = NearbyResultItem(
        name="Indiranagar Police Station",
        type="police_station",
        distance_meters=1800.0,
        location=LatLon(lat=12.9784, lon=77.6408),
        source="postgis",
    )
    mock_find_nearby = AsyncMock(return_value=([fake_result], "postgis"))
    monkeypatch.setattr("app.api.nearby.find_nearby", mock_find_nearby)

    resp = client.post(
        "/geoai/nearby",
        headers=auth_headers,
        json={"type": "police_station", "lat": 12.9716, "lon": 77.5946, "radius": 5000},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    assert body["results"][0]["name"] == "Indiranagar Police Station"
    mock_find_nearby.assert_awaited_once()


def test_nearby_rejects_unsupported_type(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.post(
        "/geoai/nearby", headers=auth_headers, json={"type": "restaurant", "lat": 12.9, "lon": 77.5}
    )
    assert resp.status_code == 422
