"""LLM provider factory.

Instantiates the correct provider based on LLM_PROVIDER env var.
Agent code should never know which provider is running.
"""

from __future__ import annotations

from app.config.settings import get_settings
from app.llm.provider import LLMProvider
from app.logging.logger import get_logger

logger = get_logger("agent.llm.factory")


def get_provider(provider_name: str | None = None) -> LLMProvider:
    """Create and return the configured LLM provider.

    Args:
        provider_name: Override the provider. If None, uses LLM_PROVIDER env.

    Returns:
        An instance of the configured LLMProvider.

    Raises:
        ValueError: If the provider name is not supported.
    """
    name = (provider_name or get_settings().llm_provider).lower()

    if name == "openai":
        from app.llm.openai_provider import OpenAIProvider
        return OpenAIProvider()

    if name == "ollama":
        from app.llm.ollama_provider import OllamaProvider
        return OllamaProvider()

    if name == "opencode":
        from app.llm.opencode_provider import OpenCodeProvider
        return OpenCodeProvider()

    raise ValueError(
        f"Unsupported LLM provider: {name!r}. "
        f"Supported: 'openai', 'ollama', 'opencode'."
    )


def get_provider_info() -> dict[str, str]:
    """Return info about the currently configured provider."""
    settings = get_settings()
    name = settings.llm_provider.lower()

    if name == "openai":
        return {
            "provider": "openai",
            "model": settings.openai_model,
            "base_url": settings.openai_base_url or "https://api.openai.com/v1",
        }
    if name == "ollama":
        return {
            "provider": "ollama",
            "model": settings.ollama_model,
            "base_url": settings.ollama_url,
        }
    if name == "opencode":
        return {
            "provider": "opencode",
            "model": settings.opencode_model,
            "base_url": settings.opencode_base_url,
        }
    return {"provider": name, "model": "unknown", "base_url": "unknown"}
