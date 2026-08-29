"""OpenAI (and OpenAI-compatible) LLM provider.

Works with OpenAI, Azure OpenAI, and any OpenAI-compatible API
(e.g. local Llama via vLLM/Ollama with --openai-compatible flag).
"""

from __future__ import annotations

import json
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

logger = get_logger("agent.llm.openai")


class OpenAIProvider(LLMProvider):
    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.openai_model
        self._max_tokens = settings.openai_max_tokens
        self._temperature = settings.openai_temperature

        client_kwargs: dict = {"api_key": settings.openai_api_key}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url

        self._client = openai.AsyncOpenAI(**client_kwargs)
        self._stream_client = openai.AsyncOpenAI(**client_kwargs)

        logger.info(
            "OpenAI provider initialized (model=%s, base_url=%s)",
            self._model,
            settings.openai_base_url or "https://api.openai.com/v1",
        )

    def _to_openai_tools(
        self, tools: list[ToolDefinition] | None
    ) -> list[dict] | None:
        if not tools:
            return None
        return [t.model_dump() for t in tools]

    def _to_openai_messages(
        self, messages: list[LLMMessage]
    ) -> list[dict]:
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
        kwargs: dict = {
            "model": self._model,
            "messages": self._to_openai_messages(messages),
            "temperature": temperature if temperature is not None else self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
        }
        openai_tools = self._to_openai_tools(tools)
        if openai_tools:
            kwargs["tools"] = openai_tools

        response = await self._client.chat.completions.create(**kwargs)
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

            # Only emit completed tool calls when the stream finishes
            finish = choice.finish_reason

            yield LLMStreamChunk(
                content_delta=content_delta,
                tool_calls=stream_tool_calls,
                finish_reason=finish,
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
        await self._client.close()
        await self._stream_client.close()
        logger.info("OpenAI provider closed")
