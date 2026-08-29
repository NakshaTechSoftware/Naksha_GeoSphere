"""Centralized configuration for the AI Agent Service.

All credentials and internal URLs come from environment variables —
never hardcoded, never exposed in responses.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Application ---
    app_name: str = "Naksha GeoAI Agent Service"
    app_env: str = "development"
    debug: bool = False
    log_level: str = "INFO"
    docs_enabled: bool = True

    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    trusted_hosts_raw: str = Field(
        default="localhost,127.0.0.1", alias="TRUSTED_HOSTS"
    )

    # --- LLM Provider ---
    llm_provider: str = Field(
        default="openai",
        alias="LLM_PROVIDER",
        description="Provider: 'openai', 'ollama', or 'opencode'.",
    )

    # OpenAI
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4.1", alias="OPENAI_MODEL")
    openai_base_url: str | None = Field(default=None, alias="OPENAI_BASE_URL")
    openai_max_tokens: int = Field(default=4096, alias="OPENAI_MAX_TOKENS")
    openai_temperature: float = Field(default=0.2, alias="OPENAI_TEMPERATURE")

    # Ollama (local LLM)
    ollama_url: str = Field(
        default="http://localhost:11434",
        alias="OLLAMA_URL",
        description="Ollama server URL.",
    )
    ollama_model: str = Field(
        default="qwen2.5:3b",
        alias="OLLAMA_MODEL",
        description="Ollama model to use.",
    )
    ollama_temperature: float = Field(
        default=0.1,
        alias="OLLAMA_TEMPERATURE",
        description="Lower temperature for deterministic GIS tool calls.",
    )
    ollama_num_ctx: int = Field(
        default=4096,
        alias="OLLAMA_NUM_CTX",
        description="Context window size.",
    )
    ollama_timeout: float = Field(
        default=120.0,
        alias="OLLAMA_TIMEOUT",
        description="Request timeout in seconds.",
    )

    # OpenCode Zen (cloud, OpenAI-compatible)
    opencode_api_key: str = Field(
        default="",
        alias="OPENCODE_API_KEY",
        description="OpenCode Zen API key.",
    )
    opencode_model: str = Field(
        default="mimo-v2.5-free",
        alias="OPENCODE_MODEL",
        description="OpenCode Zen model name.",
    )
    opencode_base_url: str = Field(
        default="https://opencode.ai/zen/v1",
        alias="OPENCODE_BASE_URL",
        description="OpenCode Zen API base URL.",
    )
    opencode_max_tokens: int = Field(
        default=4096,
        alias="OPENCODE_MAX_TOKENS",
    )
    opencode_temperature: float = Field(
        default=0.1,
        alias="OPENCODE_TEMPERATURE",
        description="Low temperature for deterministic GIS tool calls.",
    )
    opencode_timeout: float = Field(
        default=60.0,
        alias="OPENCODE_TIMEOUT",
        description="Request timeout in seconds.",
    )

    # --- GeoAI Tool Adapter Service ---
    geoai_base_url: str = Field(
        default="http://geoai-service:8000",
        alias="GEOAI_BASE_URL",
        description="Internal URL to the GeoAI Tool Adapter Service.",
    )
    geoai_api_key: str = Field(default="", alias="GEOAI_API_KEY")
    geoai_timeout_seconds: float = Field(default=30.0, alias="GEOAI_TIMEOUT_SECONDS")

    # --- Redis (conversation memory) ---
    redis_url: str = Field(default="redis://redis:6379/3", alias="REDIS_URL")
    memory_ttl_seconds: int = Field(
        default=3600, alias="MEMORY_TTL_SECONDS",
        description="How long to keep conversation history.",
    )
    memory_max_messages: int = Field(
        default=50, alias="MEMORY_MAX_MESSAGES",
        description="Max messages to keep per session.",
    )

    # --- Security ---
    agent_api_keys_raw: str = Field(default="", alias="AGENT_API_KEYS")
    rate_limit_per_key: int = Field(default=60, alias="RATE_LIMIT_PER_KEY")
    rate_limit_window_seconds: int = Field(
        default=60, alias="RATE_LIMIT_WINDOW_SECONDS"
    )
    max_tool_rounds: int = Field(
        default=10, alias="MAX_TOOL_ROUNDS",
        description="Max LLM tool-calling rounds before forced text answer.",
    )

    # --- Agent behaviour ---
    enable_streaming: bool = Field(
        default=True, alias="ENABLE_STREAMING",
        description="Whether to support SSE streaming responses.",
    )

    # --- Derived properties ---
    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def trusted_hosts(self) -> list[str]:
        return [h.strip() for h in self.trusted_hosts_raw.split(",") if h.strip()]

    @property
    def agent_api_keys(self) -> set[str]:
        return {k.strip() for k in self.agent_api_keys_raw.split(",") if k.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
