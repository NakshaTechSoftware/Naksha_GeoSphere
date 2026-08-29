"""Ollama LLM provider.

Implements the LLMProvider interface using the Ollama HTTP API
(POST /api/chat). Supports native tool calling when the model supports
it, with a JSON text extraction fallback for models like Qwen2.5 that
output tool calls as structured JSON in the response text.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import AsyncIterator

import httpx

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

logger = get_logger("agent.llm.ollama")


class OllamaProvider(LLMProvider):
    """Ollama-native LLM provider with tool calling support."""

    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.ollama_model
        self._base_url = settings.ollama_url.rstrip("/")
        self._temperature = settings.ollama_temperature
        self._num_ctx = settings.ollama_num_ctx
        self._timeout = settings.ollama_timeout
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(self._timeout, connect=10.0),
        )
        logger.info(
            "Ollama provider initialized (model=%s, url=%s)",
            self._model,
            self._base_url,
        )

    def _to_ollama_messages(
        self, messages: list[LLMMessage]
    ) -> list[dict]:
        """Convert internal messages to Ollama chat format."""
        result = []
        for msg in messages:
            if msg.role == "tool":
                # Ollama tool messages: just role + content, no tool_call_id
                result.append({
                    "role": "tool",
                    "content": msg.content or "",
                })
            elif msg.tool_calls:
                # Assistant message with tool calls
                # Ollama expects tool_calls as list of {type, function} dicts
                formatted_tcs = []
                for tc in msg.tool_calls:
                    if isinstance(tc, dict):
                        # Ollama expects arguments as a dict, not a JSON string
                        func_data = tc.get("function", {})
                        args = func_data.get("arguments", {})
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except (json.JSONDecodeError, TypeError):
                                pass
                        formatted_tcs.append({
                            "type": "function",
                            "function": {
                                "name": func_data.get("name", ""),
                                "arguments": args,
                            },
                        })
                    else:
                        args = tc.function.arguments
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except (json.JSONDecodeError, TypeError):
                                pass
                        formatted_tcs.append({
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": args,
                            },
                        })
                result.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": formatted_tcs,
                })
            else:
                result.append({"role": msg.role, "content": msg.content or ""})
        return result

    def _to_ollama_tools(
        self, tools: list[ToolDefinition] | None
    ) -> list[dict] | None:
        """Convert internal tool definitions to Ollama format."""
        if not tools:
            return None
        ollama_tools = []
        for tool in tools:
            ollama_tools.append({
                "type": "function",
                "function": {
                    "name": tool.function.name,
                    "description": tool.function.description,
                    "parameters": tool.function.parameters,
                },
            })
        return ollama_tools

    def _extract_tool_calls_from_text(
        self, text: str
    ) -> list[ToolCall]:
        """Fallback: extract tool calls from JSON in LLM text output.

        Qwen2.5 and similar models may output tool calls as:

            ```json
            {"tool": "find_nearest_place", "arguments": {...}}
            ```

        or as a function call block. This parser handles both patterns.
        """
        if not text:
            return []

        tool_calls: list[ToolCall] = []

        # Pattern 1: ```json blocks containing tool call
        json_blocks = re.findall(
            r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL
        )
        for block in json_blocks:
            tc = self._try_parse_tool_json(block.strip())
            if tc:
                tool_calls.append(tc)

        if tool_calls:
            return tool_calls

        # Pattern 2: Find JSON objects with "tool" or "name" key.
        # Use a bracket-counting approach to handle nested objects.
        for candidate in self._find_json_objects(text):
            tc = self._try_parse_tool_json(candidate)
            if tc:
                tool_calls.append(tc)

        if tool_calls:
            return tool_calls

        # Pattern 3: Look for function call syntax like:
        # find_nearest_place(category="police_station", latitude=12.97, ...)
        func_pattern = re.compile(
            r'(\w+)\(([^)]*)\)', re.MULTILINE
        )
        known_tools = {
            "find_nearest_place", "reverse_geocode", "search_place",
            "query_spatial_layer", "get_route",
        }
        for match in func_pattern.finditer(text):
            func_name = match.group(1)
            if func_name not in known_tools:
                continue
            args_str = match.group(2)
            args = self._parse_function_args(args_str)
            if args is not None:
                tool_calls.append(ToolCall(
                    id=f"call_{uuid.uuid4().hex[:12]}",
                    function=ToolCallFunction(
                        name=func_name,
                        arguments=json.dumps(args),
                    ),
                ))

        return tool_calls

    def _find_json_objects(self, text: str) -> list[str]:
        """Find all complete JSON objects in text using bracket counting.

        This handles nested objects like:
        {"name": "find_nearest_place", "arguments": {"category": "hospital"}}
        """
        results: list[str] = []
        i = 0
        while i < len(text):
            if text[i] == '{':
                depth = 0
                start = i
                in_string = False
                escape = False
                for j in range(i, len(text)):
                    c = text[j]
                    if escape:
                        escape = False
                        continue
                    if c == '\\':
                        escape = True
                        continue
                    if c == '"':
                        in_string = not in_string
                        continue
                    if in_string:
                        continue
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            results.append(text[start:j + 1])
                            i = j
                            break
            i += 1
        return results

    def _try_parse_tool_json(self, text: str) -> ToolCall | None:
        """Try to parse a JSON string as a tool call."""
        try:
            data = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return None

        if not isinstance(data, dict):
            return None

        # Normalize: accept "tool" or "name" as the tool name key
        tool_name = data.get("name") or data.get("tool")
        if not tool_name:
            return None

        # Normalize: accept "arguments" or "parameters" as the args key
        args = data.get("arguments") or data.get("parameters") or {}
        if isinstance(args, str):
            args_str = args
        else:
            args_str = json.dumps(args)

        return ToolCall(
            id=f"call_{uuid.uuid4().hex[:12]}",
            function=ToolCallFunction(
                name=tool_name,
                arguments=args_str,
            ),
        )

    def _parse_function_args(self, args_str: str) -> dict | None:
        """Parse function call arguments from 'key=value' format."""
        if not args_str.strip():
            return {}

        result: dict = {}
        # Split by comma, handle quoted strings
        parts = re.findall(
            r'(\w+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([\d.]+)|(\w+))',
            args_str,
        )
        for part in parts:
            key = part[0]
            # The value is in one of the capture groups
            value = part[1] or part[2] or part[3] or part[4]
            # Try to parse as number
            try:
                value = int(value)
            except ValueError:
                try:
                    value = float(value)
                except ValueError:
                    pass
            result[key] = value

        return result if result else None

    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> LLMResponse:
        payload: dict = {
            "model": self._model,
            "messages": self._to_ollama_messages(messages),
            "stream": False,
            "options": {
                "temperature": temperature if temperature is not None else self._temperature,
                "num_ctx": self._num_ctx,
            },
        }
        ollama_tools = self._to_ollama_tools(tools)
        if ollama_tools:
            payload["tools"] = ollama_tools

        try:
            resp = await self._client.post("/api/chat", json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            error_body = e.response.text[:500] if e.response else "no body"
            logger.error("Ollama HTTP error %s: %s", e.response.status_code if e.response else '?', error_body)
            raise
        except httpx.ConnectError:
            logger.error(
                "Cannot connect to Ollama at %s. Is it running?",
                self._base_url,
            )
            raise

        data = resp.json()
        message = data.get("message", {})
        content = message.get("content", "")

        # Parse tool calls from the response
        tool_calls: list[ToolCall] = []

        # First check if Ollama returned native tool calls
        native_tool_calls = message.get("tool_calls", [])
        if native_tool_calls:
            for tc in native_tool_calls:
                func = tc.get("function", {})
                name = func.get("name", "")
                args = func.get("arguments", {})
                if name:
                    tool_calls.append(ToolCall(
                        id=f"call_{uuid.uuid4().hex[:12]}",
                        function=ToolCallFunction(
                            name=name,
                            arguments=json.dumps(args) if isinstance(args, dict) else str(args),
                        ),
                    ))

        # If no native tool calls, try JSON extraction fallback
        if not tool_calls and content:
            tool_calls = self._extract_tool_calls_from_text(content)

        # Determine finish reason
        finish_reason = "stop"
        if tool_calls:
            finish_reason = "tool_calls"

        # Extract usage info
        usage = {}
        if "prompt_eval_count" in data:
            usage["prompt_tokens"] = data["prompt_eval_count"]
        if "eval_count" in data:
            usage["completion_tokens"] = data["eval_count"]
        if "prompt_eval_count" in data and "eval_count" in data:
            usage["total_tokens"] = data["prompt_eval_count"] + data["eval_count"]

        return LLMResponse(
            content=content if not tool_calls else None,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            usage=usage,
            model=data.get("model", self._model),
            raw=data,
        )

    async def stream(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> AsyncIterator[LLMStreamChunk]:
        payload: dict = {
            "model": self._model,
            "messages": self._to_ollama_messages(messages),
            "stream": True,
            "options": {
                "temperature": temperature if temperature is not None else self._temperature,
                "num_ctx": self._num_ctx,
            },
        }
        ollama_tools = self._to_ollama_tools(tools)
        if ollama_tools:
            payload["tools"] = ollama_tools

        full_content = ""
        accumulated_tool_calls: list[ToolCall] = []

        try:
            async with self._client.stream("POST", "/api/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    message = chunk.get("message", {})
                    content_delta = message.get("content", "")
                    full_content += content_delta

                    # Collect native tool calls from stream
                    native_tcs = message.get("tool_calls", [])
                    for tc in native_tcs:
                        func = tc.get("function", {})
                        name = func.get("name", "")
                        args = func.get("arguments", {})
                        if name:
                            accumulated_tool_calls.append(ToolCall(
                                id=f"call_{uuid.uuid4().hex[:12]}",
                                function=ToolCallFunction(
                                    name=name,
                                    arguments=json.dumps(args) if isinstance(args, dict) else str(args),
                                ),
                            ))

                    if content_delta:
                        yield LLMStreamChunk(content_delta=content_delta)

                    # Emit finish when done
                    if chunk.get("done"):
                        # If no native tool calls, try text extraction
                        if not accumulated_tool_calls and full_content:
                            accumulated_tool_calls = self._extract_tool_calls_from_text(full_content)

                        finish = "stop"
                        if accumulated_tool_calls:
                            finish = "tool_calls"

                        yield LLMStreamChunk(
                            content_delta="",
                            tool_calls=accumulated_tool_calls,
                            finish_reason=finish,
                        )

        except httpx.ConnectError:
            logger.error(
                "Cannot connect to Ollama at %s", self._base_url
            )
            raise

    async def close(self) -> None:
        await self._client.aclose()
        logger.info("Ollama provider closed")
