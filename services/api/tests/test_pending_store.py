"""`pending_store` logic, exercised against an in-memory fake Redis so it
never depends on a live Redis instance."""

from __future__ import annotations

from typing import cast

from redis.asyncio import Redis

from app.modules.authentication.pending_store import (
    PendingRegistration,
    delete_pending_registration,
    get_pending_registration,
    record_failed_attempt,
    save_pending_registration,
)


class FakeRedis:
    """Minimal stand-in for the subset of `redis.asyncio.Redis` that
    `pending_store` actually calls."""

    def __init__(self) -> None:
        self._values: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._values[key] = value
        if ex is not None:
            self._ttls[key] = ex
        return True

    async def get(self, key: str) -> str | None:
        return self._values.get(key)

    async def delete(self, key: str) -> int:
        existed = key in self._values
        self._values.pop(key, None)
        self._ttls.pop(key, None)
        return 1 if existed else 0

    async def ttl(self, key: str) -> int:
        return self._ttls.get(key, -2 if key not in self._values else -1)


def _fake_redis() -> Redis:
    return cast(Redis, FakeRedis())


def _registration(email: str = "ada@example.com") -> PendingRegistration:
    return PendingRegistration(
        full_name="Ada Lovelace",
        email=email,
        organization_name="Example Org",
        role_or_use_case="developer",
        password_hash="hashed",
        terms_version="1.0",
        privacy_version="1.0",
        terms_accepted_at="2026-01-01T00:00:00+00:00",
        code_hash="deadbeef",
    )


async def test_save_and_get_round_trip() -> None:
    redis = _fake_redis()
    registration = _registration()
    await save_pending_registration(redis, registration=registration, ttl_seconds=600)

    fetched = await get_pending_registration(redis, registration.email)
    assert fetched == registration


async def test_get_returns_none_for_unknown_email() -> None:
    redis = _fake_redis()
    assert await get_pending_registration(redis, "nobody@example.com") is None


async def test_resubmission_overwrites_earlier_record() -> None:
    redis = _fake_redis()
    email = "ada@example.com"
    await save_pending_registration(redis, registration=_registration(email), ttl_seconds=600)

    replacement = PendingRegistration(
        full_name="Ada Lovelace",
        email=email,
        organization_name="New Org",
        role_or_use_case="developer",
        password_hash="hashed-2",
        terms_version="1.0",
        privacy_version="1.0",
        terms_accepted_at="2026-01-02T00:00:00+00:00",
        code_hash="newhash",
    )
    await save_pending_registration(redis, registration=replacement, ttl_seconds=600)

    fetched = await get_pending_registration(redis, email)
    assert fetched == replacement


async def test_delete_removes_the_record() -> None:
    redis = _fake_redis()
    registration = _registration()
    await save_pending_registration(redis, registration=registration, ttl_seconds=600)

    await delete_pending_registration(redis, registration.email)

    assert await get_pending_registration(redis, registration.email) is None


async def test_record_failed_attempt_increments_and_preserves_data() -> None:
    redis = _fake_redis()
    registration = _registration()
    await save_pending_registration(redis, registration=registration, ttl_seconds=600)

    first = await record_failed_attempt(redis, registration.email)
    second = await record_failed_attempt(redis, registration.email)

    assert first == 1
    assert second == 2
    fetched = await get_pending_registration(redis, registration.email)
    assert fetched is not None
    assert fetched.attempts == 2
    assert fetched.code_hash == registration.code_hash


async def test_record_failed_attempt_preserves_remaining_ttl() -> None:
    redis = _fake_redis()
    registration = _registration()
    await save_pending_registration(redis, registration=registration, ttl_seconds=600)
    fake = cast(FakeRedis, redis)
    key = next(iter(fake._values))  # noqa: SLF001 — test-only introspection
    fake._ttls[key] = 42  # noqa: SLF001 — simulate elapsed time

    await record_failed_attempt(redis, registration.email)

    assert fake._ttls[key] == 42


async def test_record_failed_attempt_returns_none_once_record_is_gone() -> None:
    redis = _fake_redis()
    assert await record_failed_attempt(redis, "nobody@example.com") is None
