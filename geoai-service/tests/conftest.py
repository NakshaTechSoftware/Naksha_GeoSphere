"""Shared test fixtures.

These tests exercise the HTTP surface (auth, rate limiting, tool dispatch,
schema validation) without requiring a live Postgres/PostGIS instance —
DB-dependent service calls are monkeypatched at the service-function
boundary. See tests/test_nearby.py for the one test that *does* need a
real PostGIS connection, explicitly skipped unless TEST_DATABASE_URL is set.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GEOAI_API_KEYS", "test-key-123")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
# Starlette's TestClient sends Host: testserver — TrustedHostMiddleware must allow it.
os.environ.setdefault("TRUSTED_HOSTS", "localhost,127.0.0.1,testserver")

from app.config.settings import get_settings  # noqa: E402
from app.main import app  # noqa: E402

get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def api_key() -> str:
    return "test-key-123"


@pytest.fixture
def auth_headers(api_key: str) -> dict[str, str]:
    return {"X-API-Key": api_key}
