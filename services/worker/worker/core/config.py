"""Typed worker configuration.

Mirrors the pattern used by `services/api/app/core/config.py`: required
fields have no hardcoded default and must come from the environment.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "testing", "staging", "production"]


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Environment = "development"
    log_level: str = "INFO"

    # Required — no hardcoded default.
    celery_broker_url: str
    celery_result_backend: str

    # --- Object storage (MinIO locally / S3-compatible in production) ----
    # Mirrors services/api/app/core/config.py so the same env vars drive both.
    minio_endpoint: str = "minio:9000"
    minio_use_ssl: bool = False
    minio_access_key: str
    minio_secret_key: str
    s3_force_path_style: bool = True
    s3_region: str = "us-east-1"
    s3_bucket_temporary_data: str = "geosphere-temporary-data"

    # Per-task safety limits.
    task_soft_time_limit_seconds: int = 240
    task_time_limit_seconds: int = 300
    task_max_retries: int = 3
    task_default_retry_delay_seconds: int = 30

    # --- Mail (verification emails, etc.) --------------------------------
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "no-reply@nakshageosphere.local"
    smtp_use_tls: bool = False


@lru_cache
def get_worker_settings() -> WorkerSettings:
    return WorkerSettings()  # type: ignore[call-arg]
