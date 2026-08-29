"""Tool definition loader.

Dynamically loads tool schemas from the GeoAI Tool Adapter Service
and converts them into the format required by the LLM provider.
Tools are never hardcoded here.
"""

from __future__ import annotations

import time
from typing import Any

from app.geoai.client import fetch_tool_definitions
from app.llm.models import ToolDefinition, ToolFunction
from app.logging.logger import get_logger

logger = get_logger("agent.geoai.tools")

# Module-level cache: tool definitions are fetched once and reused.
_cached_tools: list[ToolDefinition] | None = None
_cache_time: float = 0.0
_CACHE_TTL = 300  # 5 minutes


async def load_tools() -> list[ToolDefinition]:
    """Load tool definitions from the GeoAI service, with caching.

    Returns a list of ToolDefinition objects ready to pass to the LLM.
    """
    global _cached_tools, _cache_time

    now = time.time()
    if _cached_tools is not None and (now - _cache_time) < _CACHE_TTL:
        return _cached_tools

    try:
        raw_definitions = await fetch_tool_definitions()
        tools: list[ToolDefinition] = []
        for defn in raw_definitions:
            func = defn.get("function", defn)
            tools.append(
                ToolDefinition(
                    function=ToolFunction(
                        name=func["name"],
                        description=func.get("description", ""),
                        parameters=func.get("parameters", {}),
                    )
                )
            )
        _cached_tools = tools
        _cache_time = now
        logger.info("Loaded %d tool definitions from GeoAI service", len(tools))
        return tools
    except Exception as e:
        logger.error("Failed to load tool definitions: %s", e)
        if _cached_tools is not None:
            logger.warning("Using stale cached tool definitions")
            return _cached_tools
        raise


def invalidate_cache() -> None:
    """Force a refresh of cached tool definitions."""
    global _cached_tools, _cache_time
    _cached_tools = None
    _cache_time = 0.0
