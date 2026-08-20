"""Shared async Redis client.

Mirrors the `get_s3_client()` pattern in `storage_client.py` — a single
cached client, configuration sourced from `Settings.redis_url` only.
"""

from __future__ import annotations

from functools import lru_cache

import redis.asyncio as redis_asyncio

from app.core.config import get_settings


@lru_cache
def get_redis_client() -> redis_asyncio.Redis:
    settings = get_settings()
    client: redis_asyncio.Redis = redis_asyncio.from_url(  # type: ignore[no-untyped-call]
        settings.redis_url, socket_connect_timeout=5, socket_timeout=5
    )
    return client
