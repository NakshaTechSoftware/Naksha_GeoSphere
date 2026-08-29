"""Query analytics — logs every GeoAI request for observability.

Records: query, intent, tool, arguments, latency, status.
Stores in Redis (structured logs) for future dashboarding.
"""

from __future__ import annotations

import json
import time
from typing import Any

from app.cache.redis import get_redis
from app.logging.logger import get_logger

logger = get_logger("agent.analytics")

# Simple intent classifier based on keyword matching
_INTENT_KEYWORDS: dict[str, list[str]] = {
    "nearest_search": ["find nearest", "near me", "nearby", "closest", "around"],
    "boundary_query": ["which district", "which village", "which taluk", "which ward", "which hobli"],
    "routing": ["navigate", "route", "directions", "how to get"],
    "geocoding": ["what is this address", "where am i", "what location"],
    "place_search": ["find", "search", "location of"],
    "land_query": ["who owns", "land record", "parcel", "property"],
    "elevation": ["elevation", "height", "terrain", "altitude"],
    "buffer": ["within", "buffer", "radius", "distance from"],
    "layer_analysis": ["layer", "intersection", "overlap", "inside"],
}


def classify_intent(query: str) -> str:
    """Classify user intent from query text."""
    lower = query.lower()
    for intent, keywords in _INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                return intent
    return "general_query"


class QueryAnalytics:
    """Tracks and logs analytics for a single query."""

    def __init__(self) -> None:
        self._start = time.monotonic()
        self.query: str = ""
        self.intent: str = ""
        self.tool: str = ""
        self.tool_args: dict[str, Any] = {}
        self.status: str = "pending"
        self.error: str | None = None
        self.has_map_context: bool = False
        self.session_id: str = ""

    def finish(self, status: str = "success", error: str | None = None) -> None:
        self.status = status
        self.error = error

    @property
    def latency_ms(self) -> float:
        return round((time.monotonic() - self._start) * 1000, 1)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "query": self.query,
            "intent": self.intent,
            "tool": self.tool or None,
            "tool_args": self.tool_args or None,
            "latency_ms": self.latency_ms,
            "status": self.status,
            "has_map_context": self.has_map_context,
            "session_id": self.session_id,
        }
        if self.error:
            result["error"] = self.error
        return result

    async def save(self) -> None:
        """Persist analytics record to Redis (capped list)."""
        record = self.to_dict()
        logger.info(
            "query_analytics: query=%s intent=%s tool=%s latency=%.0fms status=%s",
            record["query"][:80],
            record["intent"],
            record["tool"],
            record["latency_ms"],
            record["status"],
        )
        try:
            r = await get_redis()
            if r is not None:
                key = "agent:analytics"
                await r.lpush(key, json.dumps(record, default=str))
                # Keep last 1000 records
                await r.ltrim(key, 0, 999)
        except Exception as e:
            logger.warning("Failed to save analytics: %s", e)
