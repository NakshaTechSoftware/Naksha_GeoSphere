"""Feature 3 — AI tool definitions and the /geoai/tools/execute dispatcher."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.database.postgres import get_db_session
from app.main import app


@pytest.fixture(autouse=True)
def _override_db_session():
    async def _fake_session():
        yield None

    app.dependency_overrides[get_db_session] = _fake_session
    yield
    app.dependency_overrides.pop(get_db_session, None)


def test_tool_definitions_are_openai_compatible(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.get("/geoai/tools/definitions", headers=auth_headers)
    assert resp.status_code == 200
    tools = resp.json()
    names = {t["function"]["name"] for t in tools}
    assert names == {
        "reverse_geocode",
        "search_place",
        "find_nearest_place",
        "query_spatial_layer",
        "get_route",
    }
    for tool in tools:
        assert tool["type"] == "function"
        assert "parameters" in tool["function"]


def test_execute_unknown_tool_returns_error(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.post(
        "/geoai/tools/execute", headers=auth_headers, json={"name": "delete_database", "arguments": {}}
    )
    assert resp.status_code == 422  # rejected by the ToolName Literal before dispatch


def test_execute_reverse_geocode_dispatches_to_geo_service(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    mock_reverse = AsyncMock(return_value={"label": "MG Road, Bengaluru", "place_name": "MG Road"})
    monkeypatch.setattr("app.api.tools.geo_service.reverse_geocode", mock_reverse)

    resp = client.post(
        "/geoai/tools/execute",
        headers=auth_headers,
        json={"name": "reverse_geocode", "arguments": {"lat": 12.97, "lon": 77.59}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    assert body["result"]["label"] == "MG Road, Bengaluru"
    mock_reverse.assert_awaited_once_with(12.97, 77.59)
