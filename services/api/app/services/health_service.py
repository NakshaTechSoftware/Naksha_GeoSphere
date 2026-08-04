"""Aggregates dependency health checks used by the readiness and
aggregated health endpoints."""

from __future__ import annotations

import asyncio
import time

import redis.asyncio as redis_asyncio

from app.core.config import Settings
from app.database.health import check_postgis
from app.database.session import get_engine
from app.schemas.health import ServiceHealth
from app.services.storage_client import get_s3_client, required_bucket_names


async def check_database() -> ServiceHealth:
    start = time.perf_counter()
    healthy, detail = await check_postgis(get_engine())
    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    return ServiceHealth(
        status="healthy" if healthy else "unavailable",
        detail=detail,
        latency_ms=latency_ms,
    )


async def check_redis(settings: Settings) -> ServiceHealth:
    start = time.perf_counter()
    client = redis_asyncio.from_url(  # type: ignore[no-untyped-call]
        settings.redis_url, socket_connect_timeout=2, socket_timeout=2
    )
    try:
        pong = await client.ping()
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return ServiceHealth(
            status="healthy" if pong else "degraded",
            detail="PONG received" if pong else "unexpected response",
            latency_ms=latency_ms,
        )
    except Exception as exc:  # noqa: BLE001 — health checks must never raise
        return ServiceHealth(
            status="unavailable", detail=f"redis unreachable: {type(exc).__name__}"
        )
    finally:
        await client.aclose()


def _check_object_storage_sync(settings: Settings) -> tuple[bool, str]:
    client = get_s3_client()
    expected = set(required_bucket_names(settings))

    response = client.list_buckets()
    existing = {bucket["Name"] for bucket in response.get("Buckets", [])}
    missing = expected - existing

    if missing:
        return False, f"missing buckets: {', '.join(sorted(missing))}"
    return True, f"{len(expected)} required buckets present"


async def check_object_storage(settings: Settings) -> ServiceHealth:
    start = time.perf_counter()
    try:
        healthy, detail = await asyncio.to_thread(_check_object_storage_sync, settings)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        return ServiceHealth(
            status="healthy" if healthy else "degraded",
            detail=detail,
            latency_ms=latency_ms,
        )
    except Exception as exc:  # noqa: BLE001 — health checks must never raise
        return ServiceHealth(
            status="unavailable", detail=f"object storage unreachable: {type(exc).__name__}"
        )
