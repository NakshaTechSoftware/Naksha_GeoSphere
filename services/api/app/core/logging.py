"""Structured JSON logging configuration.

Every log record is emitted as a single JSON line containing a timestamp,
level, logger name, message, and — when available — the request
correlation ID set by `RequestIDMiddleware`. Never log credentials,
connection strings, or request bodies here.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from app.core.request_context import get_request_id


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        request_id = get_request_id()
        if request_id is not None:
            payload["request_id"] = request_id

        if record.exc_info:
            payload["exception_type"] = (
                str(record.exc_info[0].__name__) if record.exc_info[0] else None
            )

        return json.dumps(payload, default=str)


def configure_logging(level: str) -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root.handlers.clear()
    root.addHandler(handler)

    # Keep noisy third-party loggers at a sane level without silencing them.
    logging.getLogger("uvicorn.access").setLevel(level.upper())
    logging.getLogger("uvicorn.error").setLevel(level.upper())


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
