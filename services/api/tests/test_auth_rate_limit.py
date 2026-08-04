"""Rate limiter logic, exercised against an in-memory fake Redis so it
never depends on a live Redis instance."""

from __future__ import annotations

from typing import cast

import pytest
from redis.asyncio import Redis

from app.modules.authentication.exceptions import RegistrationRateLimitedError
from app.modules.authentication.rate_limit import enforce_rate_limit


class FakeRedis:
    """Minimal stand-in for the subset of `redis.asyncio.Redis` that
    `enforce_rate_limit` actually calls. Cast to `Redis` at construction
    (below) rather than trying to structurally match redis-py's own
    loosely-typed stubs."""

    def __init__(self) -> None:
        self._counts: dict[str, int] = {}
        self.raise_on_call = False

    async def incr(self, key: str) -> int:
        if self.raise_on_call:
            raise ConnectionError("redis unreachable")
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def expire(self, key: str, seconds: int) -> bool:
        return True

    async def ttl(self, key: str) -> int:
        return 60


def _fake_redis() -> Redis:
    return cast(Redis, FakeRedis())


async def test_allows_attempts_under_the_limit() -> None:
    redis = _fake_redis()
    for _ in range(5):
        await enforce_rate_limit(
            redis, scope="ip", identifier="1.2.3.4", limit=5, window_seconds=900
        )


async def test_blocks_attempts_over_the_limit() -> None:
    redis = _fake_redis()
    for _ in range(5):
        await enforce_rate_limit(
            redis, scope="ip", identifier="1.2.3.4", limit=5, window_seconds=900
        )

    with pytest.raises(RegistrationRateLimitedError):
        await enforce_rate_limit(
            redis, scope="ip", identifier="1.2.3.4", limit=5, window_seconds=900
        )


async def test_different_identifiers_are_independent() -> None:
    redis = _fake_redis()
    for _ in range(5):
        await enforce_rate_limit(
            redis, scope="ip", identifier="1.2.3.4", limit=5, window_seconds=900
        )

    # A different identifier must not be affected by the first one's count.
    await enforce_rate_limit(redis, scope="ip", identifier="5.6.7.8", limit=5, window_seconds=900)


async def test_fails_open_when_redis_is_unreachable() -> None:
    fake = FakeRedis()
    fake.raise_on_call = True
    redis = cast(Redis, fake)

    # Must not raise — availability of registration takes priority over a
    # best-effort abuse control.
    await enforce_rate_limit(redis, scope="ip", identifier="1.2.3.4", limit=5, window_seconds=900)
