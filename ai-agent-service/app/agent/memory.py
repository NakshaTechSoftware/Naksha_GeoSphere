"""Conversation memory manager.

Wraps the Redis cache layer to provide the agent with conversational
context: previous messages, last known location, map context, and tool results.

Performance note: loads the session blob ONCE per turn (on first access)
and buffers every mutation in-process; nothing touches Redis again until
`flush()` is called explicitly (see app/agent/agent.py, once per turn).
This replaced a per-field read/write design that cost ~10-12 Redis round
trips per turn — expensive when REDIS_URL points at a remote host, which
was the dominant source of latency even for trivial messages.
"""

from __future__ import annotations

from typing import Any

from app.cache.redis import ConversationMemory
from app.config.settings import get_settings
from app.logging.logger import get_logger

logger = get_logger("agent.memory")


class MemoryManager:
    """High-level interface for conversation history and spatial context.

    All reads/writes operate on an in-process copy of the session blob.
    Call `flush()` once, after all mutations for a turn are done, to
    persist them in a single Redis round trip. If nothing was ever read
    or written, flush() is a no-op (no round trip at all).
    """

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self._memory = ConversationMemory(session_id)
        self._data: dict[str, Any] | None = None

    async def _ensure_loaded(self) -> dict[str, Any]:
        if self._data is None:
            self._data = await self._memory.load()
        return self._data

    async def flush(self) -> None:
        """Persist all buffered changes in one Redis round trip."""
        if self._data is not None:
            await self._memory.save(self._data)

    # ---- Messages ----

    async def get_context_messages(self) -> list[dict[str, str]]:
        """Return previous messages formatted for the LLM."""
        data = await self._ensure_loaded()
        return [
            {"role": msg["role"], "content": msg.get("content", "")}
            for msg in data["messages"]
            if msg.get("role") in ("user", "assistant")
        ]

    async def save_user_message(self, content: str) -> None:
        await self._append_message("user", content)

    async def save_assistant_message(
        self,
        content: str,
        tool_used: str | None = None,
        tool_result: dict[str, Any] | None = None,
    ) -> None:
        extra: dict[str, Any] = {}
        if tool_used:
            extra["tool_used"] = tool_used
        if tool_result:
            extra["tool_result"] = tool_result
        await self._append_message("assistant", content, **extra)

    async def _append_message(self, role: str, content: str, **extra: Any) -> None:
        data = await self._ensure_loaded()
        message: dict[str, Any] = {"role": role, "content": content}
        message.update(extra)
        data["messages"].append(message)

        settings = get_settings()
        if len(data["messages"]) > settings.memory_max_messages:
            data["messages"] = data["messages"][-settings.memory_max_messages :]

    # ---- Location ----

    async def get_last_location(self) -> dict[str, float] | None:
        """Return the last known user location, if stored."""
        data = await self._ensure_loaded()
        loc = data["metadata"].get("last_location")
        if loc and "lat" in loc and "lon" in loc:
            return loc
        return None

    async def save_location(self, lat: float, lon: float) -> None:
        data = await self._ensure_loaded()
        data["metadata"]["last_location"] = {"lat": lat, "lon": lon}

    # ---- Spatial map context ----

    async def get_last_map_context(self) -> dict[str, Any] | None:
        """Return the last map context (zoom, layers, bounds)."""
        data = await self._ensure_loaded()
        return data["metadata"].get("last_map_context")

    async def save_map_context(self, map_context: dict[str, Any]) -> None:
        """Store the map context from the frontend."""
        data = await self._ensure_loaded()
        data["metadata"]["last_map_context"] = map_context

    async def get_last_selected_feature(self) -> dict[str, Any] | None:
        """Return the last selected feature, if any."""
        data = await self._ensure_loaded()
        return data["metadata"].get("last_selected_feature")

    async def save_selected_feature(self, feature: dict[str, Any]) -> None:
        data = await self._ensure_loaded()
        data["metadata"]["last_selected_feature"] = feature

    # ---- Tool results ----

    async def get_last_tool_result(self) -> dict[str, Any] | None:
        data = await self._ensure_loaded()
        return data["metadata"].get("last_tool_result")

    async def save_tool_result(self, tool_name: str, result: dict[str, Any]) -> None:
        data = await self._ensure_loaded()
        data["metadata"]["last_tool_name"] = tool_name
        data["metadata"]["last_tool_result"] = result

    async def clear(self) -> None:
        await self._memory.clear()
        self._data = None
