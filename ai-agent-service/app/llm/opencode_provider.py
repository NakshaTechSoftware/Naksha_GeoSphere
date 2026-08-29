"""OpenCode Zen LLM provider.

Implements the LLMProvider interface using OpenCode Zen's OpenAI-compatible
API. Uses the official OpenAI SDK pointed at the OpenCode base URL, enabling
function calling with models like MiMo-V2.5-Free.

OpenCode Zen provides an OpenAI-compatible /v1/chat/completions endpoint,
so this provider is structurally identical to OpenAIProvider — the only
differences are the base URL, API key, and model name sourced from config.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator

import openai

from app.config.settings import get_settings
from app.llm.models import (
    LLMMessage,
    LLMResponse,
    LLMStreamChunk,
    ToolCall,
    ToolCallFunction,
    ToolDefinition,
)
from app.llm.provider import LLMProvider
from app.logging.logger import get_logger

logger = get_logger("agent.llm.opencode")


class OpenCodeProvider(LLMProvider):
    """OpenCode Zen provider — OpenAI-compatible API for MiMo-V2.5-Free."""

    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.opencode_model
        self._max_tokens = settings.opencode_max_tokens
        self._temperature = settings.opencode_temperature
        self._timeout = settings.opencode_timeout

        client_kwargs: dict = {
            "api_key": settings.opencode_api_key,
            "base_url": settings.opencode_base_url,
            "timeout": self._timeout,
        }

        self._client = openai.AsyncOpenAI(**client_kwargs)
        self._stream_client = openai.AsyncOpenAI(**client_kwargs)

        logger.info(
            "OpenCode Zen provider initialized (model=%s, base_url=%s)",
            self._model,
            settings.opencode_base_url,
        )

    def _to_openai_tools(
        self, tools: list[ToolDefinition] | None
    ) -> list[dict] | None:
        """Convert tool definitions to OpenAI function-calling format."""
        if not tools:
            return None
        return [t.model_dump() for t in tools]

    def _to_openai_messages(
        self, messages: list[LLMMessage]
    ) -> list[dict]:
        """Convert internal messages to OpenAI chat format."""
        result = []
        for msg in messages:
            m: dict = {"role": msg.role}
            if msg.content is not None:
                m["content"] = msg.content
            if msg.tool_calls:
                m["tool_calls"] = msg.tool_calls
            if msg.tool_call_id:
                m["tool_call_id"] = msg.tool_call_id
            if msg.name:
                m["name"] = msg.name
            result.append(m)
        return result

    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        """Send a chat completion request to OpenCode Zen."""
        kwargs: dict = {
            "model": self._model,
            "messages": self._to_openai_messages(messages),
            "temperature": temperature if temperature is not None else self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
        }
        openai_tools = self._to_openai_tools(tools)
        if openai_tools:
            kwargs["tools"] = openai_tools

        start = time.perf_counter()
        try:
            response = await self._client.chat.completions.create(**kwargs)
        except openai.AuthenticationError as e:
            logger.error("OpenCode Zen auth error: %s", e)
            raise
        except openai.RateLimitError as e:
            logger.warning("OpenCode Zen rate limited: %s", e)
            raise
        except openai.APIConnectionError as e:
            logger.error("OpenCode Zen connection error: %s", e)
            raise
        except openai.APITimeoutError as e:
            logger.error("OpenCode Zen timeout: %s", e)
            raise
        except openai.APIError as e:
            logger.error("OpenCode Zen API error: %s", e)
            raise

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        choice = response.choices[0]

        tool_calls: list[ToolCall] = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        function=ToolCallFunction(
                            name=tc.function.name,
                            arguments=tc.function.arguments,
                        ),
                    )
                )

        logger.info(
            "OpenCode Zen chat completed",
            extra={"extra_fields": {
                "provider": "opencode",
                "model": response.model,
                "latency_ms": latency_ms,
                "tool_calls": len(tool_calls),
                "finish_reason": choice.finish_reason,
                "status": "success",
            }},
        )

        return LLMResponse(
            content=choice.message.content,
            tool_calls=tool_calls,
            finish_reason=choice.finish_reason,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            model=response.model,
            raw=response.model_dump(),
        )

    async def stream(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[LLMStreamChunk]:
        """Stream a chat completion from OpenCode Zen."""
        kwargs: dict = {
            "model": self._model,
            "messages": self._to_openai_messages(messages),
            "temperature": temperature if temperature is not None else self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
            "stream": True,
        }
        openai_tools = self._to_openai_tools(tools)
        if openai_tools:
            kwargs["tools"] = openai_tools

        # Accumulate tool call state across chunks
        accumulated_tool_calls: dict[int, dict] = {}
        start = time.perf_counter()

        try:
            async for chunk in await self._stream_client.chat.completions.create(**kwargs):
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta

                content_delta = delta.content or ""

                # Accumulate tool calls
                stream_tool_calls: list[ToolCall] = []
                if delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in accumulated_tool_calls:
                            accumulated_tool_calls[idx] = {
                                "id": tc_delta.id or "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc_delta.id:
                            accumulated_tool_calls[idx]["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                accumulated_tool_calls[idx]["name"] = tc_delta.function.name
                            if tc_delta.function.arguments:
                                accumulated_tool_calls[idx]["arguments"] += tc_delta.function.arguments

                finish = choice.finish_reason

                yield LLMStreamChunk(
                    content_delta=content_delta,
                    tool_calls=stream_tool_calls,
                    finish_reason=finish,
                )

        except openai.APIConnectionError as e:
            logger.error("OpenCode Zen streaming connection error: %s", e)
            raise
        except openai.APITimeoutError as e:
            logger.error("OpenCode Zen streaming timeout: %s", e)
            raise
        except openai.APIError as e:
            logger.error("OpenCode Zen streaming API error: %s", e)
            raise

        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "OpenCode Zen stream completed",
            extra={"extra_fields": {
                "provider": "opencode",
                "model": self._model,
                "latency_ms": latency_ms,
                "status": "success",
            }},
        )

        # After stream ends, emit any accumulated tool calls as final chunk
        if accumulated_tool_calls:
            final_tool_calls = [
                ToolCall(
                    id=tc["id"],
                    function=ToolCallFunction(
                        name=tc["name"],
                        arguments=tc["arguments"],
                    ),
                )
                for tc in accumulated_tool_calls.values()
                if tc["name"]
            ]
            if final_tool_calls:
                yield LLMStreamChunk(
                    content_delta="",
                    tool_calls=final_tool_calls,
                    finish_reason="tool_calls",
                )

    async def close(self) -> None:
        """Clean up OpenAI SDK clients."""
        await self._client.close()
        await self._stream_client.close()
        logger.info("OpenCode Zen provider closed")
