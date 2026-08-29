"""Feature 4 — API key authentication and request validation."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_missing_api_key_is_rejected(client: TestClient) -> None:
    resp = client.get("/geoai/tools/definitions")
    assert resp.status_code == 401
    assert resp.json()["error_code"] == "unauthorized"


def test_wrong_api_key_is_rejected(client: TestClient) -> None:
    resp = client.get("/geoai/tools/definitions", headers={"X-API-Key": "not-the-right-key"})
    assert resp.status_code == 401


def test_valid_api_key_is_accepted(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.get("/geoai/tools/definitions", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 5


def test_invalid_body_returns_422(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.post("/geoai/nearby", headers=auth_headers, json={"type": "not_a_real_type", "lat": 12.9, "lon": 77.5})
    assert resp.status_code == 422


def test_health_endpoint_is_public(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
