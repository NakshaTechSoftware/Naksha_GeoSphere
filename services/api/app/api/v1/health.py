"""Liveness, readiness, and aggregated health endpoints.

- `/health/live`  — process-only check, no external dependencies.
- `/health/ready` — checks Postgres/PostGIS, Redis, and object storage.
- `/health`       — aggregated snapshot shaped for the frontend.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Response, status

from app.core.config import Settings, get_settings
from app.schemas.health import (
    AggregatedHealthResponse,
    LivenessResponse,
    ReadinessResponse,
    ReadinessServices,
)
from app.services.health_service import check_database, check_object_storage, check_redis

router = APIRouter(tags=["health"])


async def _gather_service_health(settings: Settings) -> ReadinessServices:
    database, redis_health, object_storage = await asyncio.gather(
        check_database(),
        check_redis(settings),
        check_object_storage(settings),
    )
    return ReadinessServices(database=database, redis=redis_health, object_storage=object_storage)


def _aggregate_status(services: ReadinessServices) -> str:
    statuses = {services.database.status, services.redis.status, services.object_storage.status}
    if statuses == {"healthy"}:
        return "healthy"
    if "unavailable" in statuses and len(statuses) > 1:
        return "degraded"
    if statuses == {"unavailable"}:
        return "unavailable"
    return "degraded"


@router.get("/health/live", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    return LivenessResponse()


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness(response: Response) -> ReadinessResponse:
    settings = get_settings()
    services = await _gather_service_health(settings)
    overall = _aggregate_status(services)

    response.status_code = (
        status.HTTP_200_OK if overall == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    return ReadinessResponse(status=overall, services=services)  # type: ignore[arg-type]


@router.get("/health", response_model=AggregatedHealthResponse)
async def aggregated_health() -> AggregatedHealthResponse:
    settings = get_settings()
    services = await _gather_service_health(settings)
    overall = _aggregate_status(services)

    return AggregatedHealthResponse(
        status=overall,  # type: ignore[arg-type]
        version="0.1.0",
        environment=settings.app_env,
        services=services,
    )
