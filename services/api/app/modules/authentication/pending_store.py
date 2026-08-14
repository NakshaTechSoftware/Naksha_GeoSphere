"""Redis-backed holding area for signup data before email verification.

No `users` row is created at registration time — the submitted data
(including the *hashed* password, never the raw one) lives only in Redis
with a TTL matching the OTP code's expiry. `AuthService.verify_email` is
the only place a `users` row is ever inserted for a new signup; if the
code is never entered, the Redis entry simply expires and nothing was ever
persisted.

Keyed by a hash of the normalized email — mirroring the "hashed
identifiers only, never a raw value, as a Redis *key*" convention already
used in `rate_limit.py`. A resubmission for the same email simply
overwrites the existing key, which is what makes the newest submission's
code the only valid one. The record itself carries only the OTP's hash
(`code_hash`), never the raw code.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass

from redis.asyncio import Redis

_KEY_PREFIX = "pending_reg:"


def _hash_email(email: str) -> str:
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]


def _key(email: str) -> str:
    return _KEY_PREFIX + _hash_email(email)


@dataclass(frozen=True)
class PendingRegistration:
    full_name: str
    email: str
    organization_name: str | None
    role_or_use_case: str | None
    password_hash: str
    terms_version: str
    privacy_version: str
    terms_accepted_at: str  # ISO 8601
    code_hash: str
    attempts: int = 0


async def save_pending_registration(
    redis: Redis,
    *,
    registration: PendingRegistration,
    ttl_seconds: int,
) -> None:
    payload = json.dumps(asdict(registration))
    await redis.set(_key(registration.email), payload, ex=ttl_seconds)


async def get_pending_registration(redis: Redis, email: str) -> PendingRegistration | None:
    raw = await redis.get(_key(email))
    if raw is None:
        return None
    decoded = raw.decode("utf-8") if isinstance(raw, bytes) else raw
    return PendingRegistration(**json.loads(decoded))


async def delete_pending_registration(redis: Redis, email: str) -> None:
    await redis.delete(_key(email))


async def record_failed_attempt(redis: Redis, email: str) -> int | None:
    """Increments the pending record's `attempts` counter, preserving its
    remaining TTL (never extends it). Returns the new attempt count, or
    `None` if the record is already gone (expired/consumed/never existed)."""
    key = _key(email)
    raw = await redis.get(key)
    if raw is None:
        return None
    decoded = raw.decode("utf-8") if isinstance(raw, bytes) else raw
    data = json.loads(decoded)
    data["attempts"] = int(data.get("attempts", 0)) + 1
    ttl = await redis.ttl(key)
    await redis.set(key, json.dumps(data), ex=max(ttl, 1))
    return data["attempts"]
