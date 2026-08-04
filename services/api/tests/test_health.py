import pytest
from httpx import AsyncClient

from app.schemas.health import ServiceHealth


def _healthy(detail: str) -> ServiceHealth:
    return ServiceHealth(status="healthy", detail=detail, latency_ms=1.0)


def _unavailable(detail: str) -> ServiceHealth:
    return ServiceHealth(status="unavailable", detail=detail)


async def test_liveness_has_no_dependencies(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


async def test_readiness_returns_200_when_all_dependencies_healthy(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_database() -> ServiceHealth:
        return _healthy("PostGIS 3.4 reachable")

    async def fake_redis(_settings: object) -> ServiceHealth:
        return _healthy("PONG received")

    async def fake_storage(_settings: object) -> ServiceHealth:
        return _healthy("4 required buckets present")

    monkeypatch.setattr("app.api.v1.health.check_database", fake_database)
    monkeypatch.setattr("app.api.v1.health.check_redis", fake_redis)
    monkeypatch.setattr("app.api.v1.health.check_object_storage", fake_storage)

    response = await client.get("/api/v1/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["services"]["database"]["status"] == "healthy"


async def test_readiness_returns_503_when_a_dependency_is_unavailable(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_database() -> ServiceHealth:
        return _unavailable("database unreachable: OperationalError")

    async def fake_redis(_settings: object) -> ServiceHealth:
        return _healthy("PONG received")

    async def fake_storage(_settings: object) -> ServiceHealth:
        return _healthy("4 required buckets present")

    monkeypatch.setattr("app.api.v1.health.check_database", fake_database)
    monkeypatch.setattr("app.api.v1.health.check_redis", fake_redis)
    monkeypatch.setattr("app.api.v1.health.check_object_storage", fake_storage)

    response = await client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"


async def test_aggregated_health_matches_frontend_contract(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_database() -> ServiceHealth:
        return _healthy("PostGIS 3.4 reachable")

    async def fake_redis(_settings: object) -> ServiceHealth:
        return _healthy("PONG received")

    async def fake_storage(_settings: object) -> ServiceHealth:
        return _healthy("4 required buckets present")

    monkeypatch.setattr("app.api.v1.health.check_database", fake_database)
    monkeypatch.setattr("app.api.v1.health.check_redis", fake_redis)
    monkeypatch.setattr("app.api.v1.health.check_object_storage", fake_storage)

    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert set(body["services"].keys()) == {"database", "redis", "object_storage"}
    assert body["version"] == "0.1.0"
