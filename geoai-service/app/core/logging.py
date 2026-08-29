"""Structured JSON logging, including the per-tool-call audit log (Feature 6).

Every AI tool invocation is logged as one JSON line with: timestamp, the
caller's session/user id, the tool name, its input parameters, execution
time, and response status — see ToolCallLogger.log().
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


class ToolCallLogger:
    """Logs one structured audit record per AI tool invocation.

    Usage:
        with ToolCallLogger.timed("find_nearest_place", session_id, params) as rec:
            result = do_the_work()
            rec.status = "success"
    """

    _logger = get_logger("geoai.tool_call")

    class _Record:
        def __init__(self, tool: str, session_id: str | None, params: dict[str, Any]) -> None:
            self.tool = tool
            self.session_id = session_id
            self.params = params
            self.status = "error"
            self._start = time.perf_counter()

        def finish(self) -> dict[str, Any]:
            latency_ms = round((time.perf_counter() - self._start) * 1000, 2)
            return {
                "tool": self.tool,
                "session_id": self.session_id,
                "input_params": self.params,
                "latency_ms": latency_ms,
                "status": self.status,
            }

    @classmethod
    @contextmanager
    def timed(cls, tool: str, session_id: str | None, params: dict[str, Any]):
        record = cls._Record(tool, session_id, params)
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
                "tool_call",
                extra={"extra_fields": fields},
            )
