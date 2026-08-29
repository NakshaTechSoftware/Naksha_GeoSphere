"""Abstract LLM provider interface.

All providers (OpenAI, Anthropic, Llama) implement this ABC so the
agent orchestration loop stays provider-agnostic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from app.llm.models import LLMMessage, LLMResponse, LLMStreamChunk, ToolDefinition


class LLMProvider(ABC):
    """Base class for LLM providers."""

    @abstractmethod
    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """Send a chat completion request and return the full response."""
        ...

    @abstractmethod
    async def stream(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[LLMStreamChunk]:
        """Stream a chat completion, yielding chunks."""
        ...

    @abstractmethod
    async def close(self) -> None:
        """Clean up provider resources."""
        ...


def get_provider(provider_name: str | None = None) -> LLMProvider:
    """Factory: instantiate the right provider based on config.

    Delegates to app.llm.factory for the actual implementation.
    Kept here for backward compatibility with existing imports.
    """
    from app.llm.factory import get_provider as _factory_get_provider
    return _factory_get_provider(provider_name)
