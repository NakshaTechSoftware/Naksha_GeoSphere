"""Redis-backed cache for environmental data (weather / air quality / CPCB
station pulls), with a stale-data fallback for when an upstream provider is
temporarily down.

Mirrors the fail-open style of `app/modules/authentication/rate_limit.py`:
a Redis outage degrades the feature (always fetch live) rather than
breaking the environment endpoints.

Every cache entry is written twice, under two keys with different TTLs:

- the "fresh" key, read on the normal cache-hit path, expiring after
  `ttl_seconds` (per Q. in the spec: 5-10 min weather, 10-15 min AQI/CPCB)
- the "stale" key, expiring much later, kept purely as a fallback to
  serve if a live re-fetch fails after the fresh key has expired

This is what lets `get_with_stale_fallback` return `data_status="STALE"`
plus the original `fetched_at` instead of a hard failure when a provider
is down but we saw it recently.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any, Literal, TypeVar

from redis.asyncio import Redis

from app.modules.environment.exceptions import UpstreamUnavailableError

logger = logging.getLogger(__name__)

_NAMESPACE = "environment"
_STALE_SUFFIX = "stale"
_STALE_TTL_SECONDS = 6 * 60 * 60  # keep a stale fallback copy for 6 hours

DataStatus = Literal["LIVE", "STALE"]

T = TypeVar("T")

# Single-flight locks, one per cache key, so concurrent requests that miss the
# same cold key (e.g. several browser tabs loading "My Environment" at once)
# share one upstream fetch instead of each independently paging through the
# ~3500-row national CPCB feed - which was cheap enough alone to trip
# data.gov.in's per-key rate limit when duplicated across requests.
_fetch_locks: dict[str, asyncio.Lock] = {}


def _get_lock(key: str) -> asyncio.Lock:
    lock = _fetch_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _fetch_locks[key] = lock
    return lock


def build_cache_key(*parts: str) -> str:
    """`environment:<parts joined by :>`, e.g. `environment:weather:12.972:77.564`."""
    return ":".join([_NAMESPACE, *parts])


def round_coordinate(value: float, precision: int = 3) -> float:
    """Rounds to a ~111m grid (3 decimal places) at the equator so nearby
    map clicks reuse the same cache entry instead of each firing a fresh
    external request."""
    return round(value, precision)


async def _get_json(redis: Redis, key: str) -> dict[str, Any] | None:
    try:
        raw = await redis.get(key)
    except Exception:  # noqa: BLE001 — cache must never break the endpoint
        logger.warning("Environment cache GET failed for key=%s", key, exc_info=True)
        return None
    if raw is None:
        return None
    try:
        parsed: dict[str, Any] = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return parsed


async def _set_json(redis: Redis, key: str, value: dict[str, Any], ttl_seconds: int) -> None:
    try:
        await redis.set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:  # noqa: BLE001
        logger.warning("Environment cache SET failed for key=%s", key, exc_info=True)


async def get_with_stale_fallback(
    redis: Redis,
    *,
    key: str,
    ttl_seconds: int,
    fetch: Callable[[], Awaitable[dict[str, Any]]],
) -> tuple[dict[str, Any], DataStatus, datetime]:
    """Cache-first fetch with a stale-data safety net.

    1. Fresh cache hit -> return it as LIVE (still within its TTL window).
    2. Cache miss -> call `fetch()`. On success, write both the fresh and
       stale copies and return LIVE.
    3. `fetch()` raises `UpstreamUnavailableError` -> fall back to the
       stale copy if one exists (return STALE); otherwise re-raise so the
       caller/aggregator can mark that section UNAVAILABLE.
    """
    fresh = await _get_json(redis, key)
    if fresh is not None:
        return fresh["data"], "LIVE", datetime.fromisoformat(fresh["fetched_at"])

    stale_key = f"{key}:{_STALE_SUFFIX}"

    async with _get_lock(key):
        # Re-check: another caller may have populated the cache while we were
        # waiting for the lock, in which case there's nothing left to fetch.
        fresh = await _get_json(redis, key)
        if fresh is not None:
            return fresh["data"], "LIVE", datetime.fromisoformat(fresh["fetched_at"])

        try:
            data = await fetch()
        except UpstreamUnavailableError:
            stale = await _get_json(redis, stale_key)
            if stale is not None:
                return stale["data"], "STALE", datetime.fromisoformat(stale["fetched_at"])
            raise

        fetched_at = datetime.now(timezone.utc)
        payload = {"data": data, "fetched_at": fetched_at.isoformat()}
        await _set_json(redis, key, payload, ttl_seconds)
        await _set_json(redis, stale_key, payload, _STALE_TTL_SECONDS)
        return data, "LIVE", fetched_at
