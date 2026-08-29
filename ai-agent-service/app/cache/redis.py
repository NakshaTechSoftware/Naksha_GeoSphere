"""Redis-based conversation memory cache.

Stores per-session conversation history so the LLM can reference
previous messages, locations, and tool results.

Falls back to in-memory storage when Redis is unavailable.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

import redis.asyncio as aioredis

from app.config.settings import get_settings
from app.logging.logger import get_logger

logger = get_logger("agent.cache")

_pool: aioredis.Redis | None = None
_redis_available: bool | None = None  # None = not checked yet

# In-memory fallback when Redis is unavailable
_memory_store: dict[str, str] = {}


async def get_redis() -> aioredis.Redis | None:
    """Return a shared Redis connection pool (lazy-init).

    Returns None if Redis is unreachable, allowing in-memory fallback.
    """
    global _pool, _redis_available

    # If we already know Redis is down, skip trying
    if _redis_available is False:
        return None

    if _pool is None:
        settings = get_settings()
        try:
            _pool = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
                max_connections=20,
                socket_connect_timeout=2,
            )
            # Quick connectivity check
            await _pool.ping()
            _redis_available = True
            logger.info("Redis pool created for %s", settings.redis_url)
        except Exception as e:
            logger.warning(
                "Redis unavailable (%s), using in-memory fallback", e
            )
            _pool = None
            _redis_available = False
            return None
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        try:
            await _pool.aclose()
        except Exception:
            pass
        _pool = None
        logger.info("Redis pool closed")


def _key(session_id: str) -> str:
    return f"agent:session:{session_id}"


def generate_session_id() -> str:
    return uuid.uuid4().hex[:16]


class ConversationMemory:
    """Read/write conversation history.

    Uses Redis when available, falls back to in-memory dict.
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id

    async def load(self) -> dict[str, Any]:
        """Return the full session blob ({messages, metadata}) in ONE round trip.

        Callers (MemoryManager) load once per turn and mutate the result
        in-process — see save() below. This replaced a previous design where
        every individual field read/write (add_message, set_metadata, ...)
        did its own GET-modify-SET pair, which added ~10-12 sequential
        round trips to Redis per chat turn. When Redis is remote (as in
        production, see REDIS_URL), each round trip is real network
        latency, and it was the dominant cause of slow responses even for
        trivial messages like "hi".
        """
        r = await get_redis()
        key = _key(self.session_id)
        raw = _memory_store.get(key) if r is None else await r.get(key)
        if raw is None:
            return {"messages": [], "metadata": {}}
        return json.loads(raw)

    async def save(self, data: dict[str, Any]) -> None:
        """Persist the full session blob in ONE round trip."""
        r = await get_redis()
        key = _key(self.session_id)
        settings = get_settings()
        serialized = json.dumps(data, default=str)
        if r is None:
            _memory_store[key] = serialized
        else:
            await r.set(key, serialized, ex=settings.memory_ttl_seconds)

    async def clear(self) -> None:
        """Delete the session entirely."""
        r = await get_redis()
        key = _key(self.session_id)
        if r is None:
            _memory_store.pop(key, None)
        else:
            await r.delete(key)
