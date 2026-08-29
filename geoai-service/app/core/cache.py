"""Redis-backed response cache (Feature 5).

Key convention matches the spec: "nearby:police_station:12.9716:77.5946" —
built here as colon-joined parts with coordinates rounded to 5 decimal
places (~1.1m precision) so nearby-identical requests share a cache entry.
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as redis

from app.config.settings import get_settings
from app.core.logging import get_logger

_settings = get_settings()
_redis: redis.Redis | None = None
_logger = get_logger("geoai.cache")


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(_settings.redis_url, decode_responses=True)
    return _redis


def build_key(*parts: Any, round_floats: int = 5) -> str:
    formatted = []
    for part in parts:
        if isinstance(part, float):
            formatted.append(f"{round(part, round_floats)}")
        else:
            formatted.append(str(part))
    return ":".join(formatted)


async def cache_get(key: str) -> dict | list | None:
    """Fails open (returns None, i.e. "cache miss") if Redis is unreachable —
    caching is a performance optimization here, not a correctness dependency,
    so an outage should degrade to "always fetch fresh," never a 5xx."""
    try:
        client = get_redis()
        raw = await client.get(key)
    except Exception:
        _logger.warning("Cache read failed — treating as a miss", extra={"extra_fields": {"key": key}})
        return None
    if raw is None:
        return None
    return json.loads(raw)


async def cache_set(key: str, value: dict | list, ttl_seconds: int) -> None:
    try:
        client = get_redis()
        await client.set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except Exception:
        _logger.warning("Cache write failed — skipping", extra={"extra_fields": {"key": key}})


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
