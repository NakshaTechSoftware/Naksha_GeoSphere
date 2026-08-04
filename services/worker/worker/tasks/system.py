"""System-level utility tasks (worker readiness checks)."""

from __future__ import annotations

import socket
from datetime import datetime, timezone
from typing import Any

from worker.main import app


@app.task(name="system.ping")
def ping() -> dict[str, Any]:
    """Simple worker-ready response — used by `pnpm worker:ping` and the
    health/validation scripts to confirm the worker is consuming tasks."""
    return {
        "status": "ready",
        "worker": socket.gethostname(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
