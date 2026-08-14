"""Tests for the environment cache helper: cache hit, cache miss + fetch,
and the stale-data fallback when an upstream provider fails.

Uses a minimal in-memory fake implementing just the `get`/`set` surface
`cache.py` calls — no real Redis needed for these unit tests (the module
is fail-open by design, so it also behaves correctly with no Redis at
all; see `test_cache_survives_broken_redis` below).
"""

from __future__ import annotations

import pytest

from app.modules.environment.cache import build_cache_key, get_with_stale_fallback
from app.modules.environment.exceptions import UpstreamUnavailableError


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = value


class BrokenRedis:
    """Simulates Redis being completely unreachable."""

    async def get(self, key: str) -> str | None:
        raise ConnectionError("redis unreachable")

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        raise ConnectionError("redis unreachable")


def test_build_cache_key_joins_parts() -> None:
    assert build_cache_key("weather", "12.972", "77.564") == "environment:weather:12.972:77.564"


@pytest.mark.asyncio
async def test_cache_miss_calls_fetch_and_stores_result() -> None:
    redis = FakeRedis()
    calls = 0

    async def fetch() -> dict:
        nonlocal calls
        calls += 1
        return {"temperature_c": 28.4}

    data, status, _ = await get_with_stale_fallback(
        redis, key="environment:weather:test", ttl_seconds=600, fetch=fetch
    )
    assert data == {"temperature_c": 28.4}
    assert status == "LIVE"
    assert calls == 1


@pytest.mark.asyncio
async def test_cache_hit_skips_fetch() -> None:
    redis = FakeRedis()
    calls = 0

    async def fetch() -> dict:
        nonlocal calls
        calls += 1
        return {"temperature_c": 28.4}

    key = "environment:weather:test"
    await get_with_stale_fallback(redis, key=key, ttl_seconds=600, fetch=fetch)
    data, status, _ = await get_with_stale_fallback(redis, key=key, ttl_seconds=600, fetch=fetch)

    assert calls == 1  # second call served entirely from cache
    assert status == "LIVE"
    assert data == {"temperature_c": 28.4}


@pytest.mark.asyncio
async def test_stale_fallback_used_when_fetch_fails_after_expiry() -> None:
    redis = FakeRedis()
    key = "environment:weather:test"

    async def succeed() -> dict:
        return {"temperature_c": 28.4}

    await get_with_stale_fallback(redis, key=key, ttl_seconds=600, fetch=succeed)
    # Simulate the fresh key expiring (but the stale copy is still there).
    del redis.store[key]

    async def fail() -> dict:
        raise UpstreamUnavailableError("Open-Meteo Weather")

    data, status, _ = await get_with_stale_fallback(redis, key=key, ttl_seconds=600, fetch=fail)
    assert status == "STALE"
    assert data == {"temperature_c": 28.4}


@pytest.mark.asyncio
async def test_raises_when_fetch_fails_and_no_stale_copy_exists() -> None:
    redis = FakeRedis()

    async def fail() -> dict:
        raise UpstreamUnavailableError("Open-Meteo Weather")

    with pytest.raises(UpstreamUnavailableError):
        await get_with_stale_fallback(
            redis, key="environment:weather:never-cached", ttl_seconds=600, fetch=fail
        )


@pytest.mark.asyncio
async def test_cache_survives_broken_redis() -> None:
    """A Redis outage must degrade to 'always fetch live', never crash the
    endpoint — mirrors the fail-open behavior of the auth rate limiter."""
    redis = BrokenRedis()
    calls = 0

    async def fetch() -> dict:
        nonlocal calls
        calls += 1
        return {"temperature_c": 28.4}

    data, status, _ = await get_with_stale_fallback(
        redis, key="environment:weather:test", ttl_seconds=600, fetch=fetch
    )
    assert calls == 1
    assert status == "LIVE"
    assert data == {"temperature_c": 28.4}
