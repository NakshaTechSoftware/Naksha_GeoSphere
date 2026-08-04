"""Shared pytest fixtures.

Sets required-but-non-secret test environment variables *before* the app
(and therefore `app.core.config.Settings`) is imported, so the test suite
never depends on a real `.env` file or live infrastructure unless a test
is explicitly marked `integration`.
"""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

_TEST_ENV = {
    "APP_ENV": "testing",
    "DEBUG": "true",
    "DATABASE_URL": "postgresql+asyncpg://test_user:test_password@localhost:5432/test_db",
    "REDIS_URL": "redis://localhost:6379/0",
    "CELERY_BROKER_URL": "redis://localhost:6379/0",
    "CELERY_RESULT_BACKEND": "redis://localhost:6379/1",
    "MINIO_ACCESS_KEY": "test-access-key",
    "MINIO_SECRET_KEY": "test-secret-key",
    "SECRET_KEY": "test-secret-key-not-for-production-use",
    "CORS_ORIGINS": "http://localhost:3000",
    "TRUSTED_HOSTS": "localhost,127.0.0.1,testserver",
}

for key, value in _TEST_ENV.items():
    # Force-override, not setdefault: when the suite runs inside a real
    # container (e.g. `docker compose exec api pytest`), .env has already
    # populated these vars via env_file — setdefault would silently keep
    # the real TRUSTED_HOSTS (missing "testserver") and break every
    # request made through the ASGI test client.
    os.environ[key] = value


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    """Each test gets a fresh Settings() so per-test env monkeypatching
    (e.g. changing APP_ENV) actually takes effect."""
    from app.core.config import get_settings

    get_settings.cache_clear()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from app.main import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
