"""Sets required-but-non-secret test environment variables before any
`worker.*` module is imported (celery app construction happens at import
time in worker.main)."""

from __future__ import annotations

import os

_TEST_ENV = {
    "APP_ENV": "testing",
    "CELERY_BROKER_URL": "redis://localhost:6379/0",
    "CELERY_RESULT_BACKEND": "redis://localhost:6379/1",
}

for key, value in _TEST_ENV.items():
    os.environ.setdefault(key, value)
