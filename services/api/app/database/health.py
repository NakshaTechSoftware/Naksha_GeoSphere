"""PostgreSQL / PostGIS readiness check."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def check_postgis(engine: AsyncEngine) -> tuple[bool, str]:
    """Confirms the database is reachable and PostGIS is installed.

    Returns (is_healthy, human_readable_detail). Never raises — callers
    treat any failure as an unhealthy dependency.
    """
    try:
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT PostGIS_Version();"))
            version = result.scalar_one()
            return True, f"PostGIS {version} reachable"
    except Exception as exc:  # noqa: BLE001 — health checks must never raise
        return False, f"database unreachable: {type(exc).__name__}"
