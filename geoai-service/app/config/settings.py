"""Centralized configuration for the GeoAI Tool Adapter Service.

Every credential and internal URL the service needs lives here, sourced
from the environment — never hardcoded, and never re-exported to a
response body or an AI tool schema. See app/core/security.py for how
GEOAI_API_KEYS is enforced.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Application ---
    app_name: str = "GeoAI Tool Adapter Service"
    app_env: str = "development"
    debug: bool = False
    log_level: str = "INFO"
    docs_enabled: bool = True

    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    trusted_hosts_raw: str = Field(default="localhost,127.0.0.1", alias="TRUSTED_HOSTS")

    # --- PostGIS (same instance as the main GeoSphere stack) ---
    database_url: str = Field(
        default="postgresql+asyncpg://naksha_app:changeme@postgres:5432/naksha_geosphere"
    )

    # --- Redis cache ---
    redis_url: str = "redis://redis:6379/2"
    cache_ttl_nearby_seconds: int = 120
    cache_ttl_geocode_seconds: int = 900
    cache_ttl_layer_query_seconds: int = 300

    # --- MinIO (internal fallback data source, never exposed) ---
    minio_endpoint: str = "minio:9000"
    minio_use_ssl: bool = False
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_source_bucket: str = "geosphere-source-data"

    # --- Existing GeoSphere backends this service wraps ---
    geosphere_web_base_url: str = "http://web:3000"
    geosphere_api_base_url: str = "http://api:8000"
    upstream_timeout_seconds: float = 20.0

    # --- Security ---
    geoai_api_keys_raw: str = Field(default="", alias="GEOAI_API_KEYS")
    rate_limit_per_key: int = 60
    rate_limit_window_seconds: int = 60

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def trusted_hosts(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts_raw.split(",") if h.strip()]

    @property
    def geoai_api_keys(self) -> set[str]:
        return {k.strip() for k in self.geoai_api_keys_raw.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
