"""Typed application configuration.

All configuration is sourced from environment variables (optionally via a
`.env` file for local development) through Pydantic Settings. Nothing here
carries a real credential — secrets must be supplied by the environment;
fields with no safe default raise a validation error at startup if unset,
which is intentional (fail fast rather than silently run unconfigured).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["development", "testing", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application -------------------------------------------------
    app_name: str = "Naksha GeoSphere"
    app_env: Environment = "development"
    debug: bool = True
    log_level: str = "INFO"
    api_docs_enabled: bool = True
    api_prefix: str = "/api/v1"

    # --- URLs / networking --------------------------------------------
    frontend_url: str = "http://localhost:3000"
    api_url: str = "http://api:8000"
    public_api_url: str = "http://localhost:8000"
    # NoDecode: these arrive as plain comma-separated strings from the
    # environment (e.g. "http://a.com,http://b.com"), not JSON arrays —
    # NoDecode stops pydantic-settings from attempting to JSON-parse them
    # before our validator below splits them.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    trusted_hosts: Annotated[list[str], NoDecode] = ["localhost", "127.0.0.1"]

    # --- Database (required — no hardcoded default) --------------------
    database_url: str

    # --- Redis / Celery (required — no hardcoded default) ---------------
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str

    # --- Object storage --------------------------------------------------
    minio_endpoint: str = "minio:9000"
    minio_use_ssl: bool = False
    minio_access_key: str
    minio_secret_key: str
    # MinIO requires path-style bucket addressing (bucket.example.com
    # virtual-hosted-style requires DNS wildcarding we don't have). Keep
    # this true for MinIO; a managed S3-compatible provider in production
    # may support/require virtual-hosted-style instead.
    s3_force_path_style: bool = True
    s3_region: str = "us-east-1"
    s3_bucket_source_data: str = "geosphere-source-data"
    s3_bucket_preview_data: str = "geosphere-preview-data"
    s3_bucket_order_output: str = "geosphere-order-output"
    s3_bucket_temporary_data: str = "geosphere-temporary-data"
    signed_url_expiry_seconds: int = 900

    # --- Mail --------------------------------------------------------
    mail_host: str = "mailpit"
    mail_port: int = 1025
    mail_from: str = "no-reply@nakshageosphere.local"

    # --- Security (required — no hardcoded default) ---------------------
    secret_key: str

    # --- Authentication / registration ----------------------------------
    email_verification_expiry_minutes: int = 30
    terms_version: str = "1.0"
    privacy_version: str = "1.0"
    registration_rate_limit_per_ip: int = 5
    registration_rate_limit_per_ip_window_seconds: int = 900
    registration_rate_limit_per_email: int = 3
    registration_rate_limit_per_email_window_seconds: int = 3600

    @field_validator("cors_origins", "trusted_hosts", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value  # already a list (e.g. default value, not from env)

    # --- Geospatial / ECW pipeline -----------------------------------
    runtime_root: str = "/workspace/runtime"
    data_root: str = "/workspace/data"
    default_source_crs: str = "EPSG:32643"
    auto_scan_on_startup: bool = True
    catalog_sync_seconds: int = 5
    tile_cache_seconds: int = 86400
    max_export_datasets: int = 250
    max_export_area_sq_km: float = 5000.0

    @property
    def catalog_dir(self) -> str:
        from pathlib import Path
        return str(Path(self.runtime_root) / "catalog")

    @property
    def bridge_inbox(self) -> str:
        from pathlib import Path
        return str(Path(self.runtime_root) / "bridge" / "inbox")

    @property
    def bridge_status(self) -> str:
        from pathlib import Path
        return str(Path(self.runtime_root) / "bridge" / "status")

    @property
    def cog_dir(self) -> str:
        from pathlib import Path
        return str(Path(self.data_root) / "cogs")

    @property
    def export_dir(self) -> str:
        from pathlib import Path
        return str(Path(self.data_root) / "exports")

    @property
    def tile_cache_dir(self) -> str:
        from pathlib import Path
        return str(Path(self.data_root) / "tile_cache")

    def ensure_directories(self) -> None:
        from pathlib import Path
        for path_str in (
            self.catalog_dir, self.bridge_inbox, self.bridge_status,
            self.cog_dir, self.export_dir, self.tile_cache_dir,
        ):
            Path(path_str).mkdir(parents=True, exist_ok=True)

    @property
    def docs_enabled(self) -> bool:
        """Hard-disable docs in production regardless of the raw flag."""
        return self.api_docs_enabled and self.app_env != "production"

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
