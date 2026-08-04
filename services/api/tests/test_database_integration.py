"""Integration test exercising a real PostgreSQL/PostGIS connection.

Skipped by default — set RUN_INTEGRATION_TESTS=1 and a working
DATABASE_URL (e.g. via `docker compose ... exec api pytest -m integration`)
to run it.
"""

from __future__ import annotations

import os

import pytest

from app.database.health import check_postgis
from app.database.session import get_engine

pytestmark = pytest.mark.integration

requires_integration = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION_TESTS") != "1",
    reason="set RUN_INTEGRATION_TESTS=1 to run against a live database",
)


@requires_integration
async def test_postgis_extension_is_enabled() -> None:
    healthy, detail = await check_postgis(get_engine())
    assert healthy is True
    assert "PostGIS" in detail
