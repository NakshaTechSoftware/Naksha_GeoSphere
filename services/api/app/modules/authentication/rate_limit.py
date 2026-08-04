"""Redis-backed fixed-window rate limiting for registration attempts.

Keys are hashed/normalized identifiers only — never a raw email, password,
or request body is written to Redis.
"""

from __future__ import annotations

import hashlib

from redis.asyncio import Redis

from app.modules.authentication.exceptions import RegistrationRateLimitedError

_NAMESPACE = "ratelimit:register"


def _hash_identifier(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


async def enforce_rate_limit(
    redis: Redis,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Increments the counter for `scope:identifier` and raises
    `RegistrationRateLimitedError` once `limit` is exceeded within the
    current fixed window. Fails open (does not block) if Redis itself is
    unreachable — availability of registration takes priority over a
    best-effort abuse control."""
    key = f"{_NAMESPACE}:{scope}:{_hash_identifier(identifier)}"

    try:
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window_seconds)
        if current > limit:
            ttl = await redis.ttl(key)
            raise RegistrationRateLimitedError(retry_after_seconds=max(ttl, 1))
    except RegistrationRateLimitedError:
        raise
    except Exception:  # noqa: BLE001 — rate limiting must never break registration
        return
