"""Structured JSON logging for the AI Agent Service.

Mirrors the logging pattern used by the GeoAI Tool Adapter Service.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from contextlib import contextmanager
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "extra_fields", None)
        if extra:
            payload.update(extra)
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


class AgentRunLogger:
    """Logs one structured audit record per agent conversation turn.

    Usage:
        with AgentRunLogger.turn("session-123", "Find hospitals near me") as rec:
            result = await agent.run(...)
            rec.tool = "find_nearest_place"
            rec.status = "success"
            rec.llm_latency_ms = 234.5
    """

    _logger = get_logger("agent.run")

    class _Record:
        def __init__(self, session_id: str, query: str) -> None:
            self.session_id = session_id
            self.query = query
            self.tool: str | None = None
            self.tool_args: dict[str, Any] | None = None
            self.status = "error"
            self.llm_latency_ms: float = 0.0
            self.total_latency_ms: float = 0.0
            self.sources: list[str] = []
            self._start = time.perf_counter()
            self._llm_start: float | None = None

        def start_llm(self) -> None:
            self._llm_start = time.perf_counter()

        def stop_llm(self) -> None:
            if self._llm_start is not None:
                self.llm_latency_ms = round(
                    (time.perf_counter() - self._llm_start) * 1000, 2
                )
                self._llm_start = None

        def finish(self) -> dict[str, Any]:
            self.total_latency_ms = round(
                (time.perf_counter() - self._start) * 1000, 2
            )
            return {
                "session_id": self.session_id,
                "query": self.query,
                "tool": self.tool,
                "tool_args": self.tool_args,
                "llm_latency_ms": self.llm_latency_ms,
                "total_latency_ms": self.total_latency_ms,
                "sources": self.sources,
                "status": self.status,
            }

    @classmethod
    @contextmanager
    def turn(cls, session_id: str, query: str):
        record = cls._Record(session_id, query)
        try:
            yield record
            if record.status == "error":
                record.status = "success"
        except Exception:
            record.status = "error"
            raise
        finally:
            fields = record.finish()
            cls._logger.info(
                "agent_turn",
                extra={"extra_fields": fields},
            )
