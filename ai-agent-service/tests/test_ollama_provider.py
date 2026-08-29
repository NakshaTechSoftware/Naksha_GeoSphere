"""Tests for the Ollama LLM provider.

Covers: provider instantiation, message conversion, tool call extraction
from text (JSON fallback), native tool calling, streaming, and error
handling — all without a live Ollama server.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.llm.models import LLMMessage, ToolDefinition, ToolFunction


# ---------------------------------------------------------------------------
# Provider selection / factory tests
# ---------------------------------------------------------------------------


class TestProviderFactory:
    def test_factory_selects_openai(self):
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="openai")
            from app.llm.factory import get_provider
            provider = get_provider("openai")
            from app.llm.openai_provider import OpenAIProvider
            assert isinstance(provider, OpenAIProvider)

    def test_factory_selects_ollama(self):
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="ollama")
            from app.llm.factory import get_provider
            provider = get_provider("ollama")
            from app.llm.ollama_provider import OllamaProvider
            assert isinstance(provider, OllamaProvider)

    def test_factory_rejects_unknown(self):
        with pytest.raises(ValueError, match="Unsupported"):
            from app.llm.factory import get_provider
            get_provider("anthropic")

    def test_factory_uses_env_default(self):
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="ollama")
            from app.llm.factory import get_provider
            provider = get_provider()  # No arg — uses settings
            from app.llm.ollama_provider import OllamaProvider
            assert isinstance(provider, OllamaProvider)

    def test_provider_info_openai(self):
        from app.llm.factory import get_provider_info
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                llm_provider="openai",
                openai_model="gpt-4.1",
                openai_base_url=None,
                ollama_url="http://localhost:11434",
                ollama_model="qwen2.5:3b",
            )
            info = get_provider_info()
            assert info["provider"] == "openai"
            assert info["model"] == "gpt-4.1"

    def test_provider_info_ollama(self):
        from app.llm.factory import get_provider_info
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                llm_provider="ollama",
                openai_model="gpt-4.1",
                openai_base_url=None,
                ollama_url="http://ollama:11434",
                ollama_model="qwen2.5:3b",
            )
            info = get_provider_info()
            assert info["provider"] == "ollama"
            assert info["model"] == "qwen2.5:3b"


# ---------------------------------------------------------------------------
# Ollama provider — initialization
# ---------------------------------------------------------------------------


class TestOllamaProviderInit:
    def test_init_configures_defaults(self):
        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="qwen2.5:3b",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=120,
            )
            from app.llm.ollama_provider import OllamaProvider
            provider = OllamaProvider()
            assert provider._model == "qwen2.5:3b"
            assert provider._base_url == "http://localhost:11434"
            assert provider._temperature == 0.1


# ---------------------------------------------------------------------------
# Message conversion tests
# ---------------------------------------------------------------------------


class TestOllamaMessageConversion:
    def _make_provider(self):
        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="test",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            from app.llm.ollama_provider import OllamaProvider
            return OllamaProvider()

    def test_system_user_assistant_messages(self):
        provider = self._make_provider()
        messages = [
            LLMMessage(role="system", content="You are a GIS assistant."),
            LLMMessage(role="user", content="Find police station"),
            LLMMessage(role="assistant", content="I'll help."),
        ]
        ollama_msgs = provider._to_ollama_messages(messages)
        assert len(ollama_msgs) == 3
        assert ollama_msgs[0]["role"] == "system"
        assert ollama_msgs[1]["role"] == "user"
        assert ollama_msgs[2]["role"] == "assistant"

    def test_tool_result_message(self):
        provider = self._make_provider()
        messages = [
            LLMMessage(
                role="tool",
                content=json.dumps({"status": "success"}),
                tool_call_id="call_abc",
            )
        ]
        ollama_msgs = provider._to_ollama_messages(messages)
        assert ollama_msgs[0]["role"] == "tool"
        assert ollama_msgs[0]["content"] == json.dumps({"status": "success"})
        # Ollama does not use tool_call_id
        assert "tool_call_id" not in ollama_msgs[0]

    def test_tool_definitions_conversion(self):
        provider = self._make_provider()
        tools = [
            ToolDefinition(
                function=ToolFunction(
                    name="find_nearest_place",
                    description="Find nearest POI",
                    parameters={"type": "object", "properties": {}},
                )
            )
        ]
        ollama_tools = provider._to_ollama_tools(tools)
        assert len(ollama_tools) == 1
        assert ollama_tools[0]["function"]["name"] == "find_nearest_place"

    def test_no_tools_returns_none(self):
        provider = self._make_provider()
        assert provider._to_ollama_tools(None) is None
        assert provider._to_ollama_tools([]) is None


# ---------------------------------------------------------------------------
# JSON tool call extraction fallback tests
# ---------------------------------------------------------------------------


class TestToolCallExtraction:
    def _make_provider(self):
        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="test",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            from app.llm.ollama_provider import OllamaProvider
            return OllamaProvider()

    def test_extract_from_json_code_block(self):
        provider = self._make_provider()
        text = '''I'll find the nearest police station.

```json
{"name": "find_nearest_place", "arguments": {"category": "police_station", "latitude": 12.97, "longitude": 77.59, "radius": 5000}}
```
'''
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 1
        assert tool_calls[0].function.name == "find_nearest_place"
        args = json.loads(tool_calls[0].function.arguments)
        assert args["category"] == "police_station"
        assert args["latitude"] == 12.97

    def test_extract_with_tool_key(self):
        provider = self._make_provider()
        text = '{"tool": "query_spatial_layer", "arguments": {"layer": "district", "geometry": [77.59, 12.97]}}'
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 1
        assert tool_calls[0].function.name == "query_spatial_layer"

    def test_extract_inline_json(self):
        provider = self._make_provider()
        text = 'Let me search for that. {"name": "search_place", "arguments": {"query": "Mysore Palace"}} is the right tool.'
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 1
        assert tool_calls[0].function.name == "search_place"

    def test_extract_multiple_tool_calls(self):
        provider = self._make_provider()
        text = '''
```json
{"name": "search_place", "arguments": {"query": "Bangalore"}}
```

Then:
```json
{"name": "get_route", "arguments": {"origin": {"lat": 12.97, "lon": 77.59}, "destination": {"lat": 12.30, "lon": 76.65}}}
```
'''
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 2
        names = {tc.function.name for tc in tool_calls}
        assert "search_place" in names
        assert "get_route" in names

    def test_no_tool_calls_in_normal_text(self):
        provider = self._make_provider()
        text = "The nearest police station is Indiranagar PS, 1.2km away."
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 0

    def test_empty_text(self):
        provider = self._make_provider()
        assert provider._extract_tool_calls_from_text("") == []
        assert provider._extract_tool_calls_from_text(None) == []

    def test_parameters_key_accepted(self):
        provider = self._make_provider()
        text = '{"name": "find_nearest_place", "parameters": {"category": "hospital", "latitude": 12.97, "longitude": 77.59}}'
        tool_calls = provider._extract_tool_calls_from_text(text)
        assert len(tool_calls) == 1
        args = json.loads(tool_calls[0].function.arguments)
        assert args["category"] == "hospital"

    def test_nested_arguments_unwrapped(self):
        """The executor should handle {"arguments": {...}} wrapping."""
        from app.agent.executor import ToolExecutor
        executor = ToolExecutor(session_id="test")
        # This tests that the executor unwraps nested arguments
        with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {"status": "success", "tool": "find_nearest_place", "result": {}}
            # Some models wrap args: {"arguments": {"category": "hospital", ...}}
            wrapped = json.dumps({"arguments": {"category": "hospital", "latitude": 12.97, "longitude": 77.59}})
            import asyncio
            asyncio.get_event_loop().run_until_complete(
                executor.execute("find_nearest_place", wrapped)
            )
            # The executor should have unwrapped and passed the inner dict
            call_args = mock_exec.call_args
            assert call_args.kwargs["arguments"]["category"] == "hospital"


# ---------------------------------------------------------------------------
# Chat method tests (mocked HTTP)
# ---------------------------------------------------------------------------


class TestOllamaChat:
    def _make_provider(self):
        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="qwen2.5:3b",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            from app.llm.ollama_provider import OllamaProvider
            return OllamaProvider()

    @pytest.mark.asyncio
    async def test_chat_returns_text_response(self):
        provider = self._make_provider()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "qwen2.5:3b",
            "message": {
                "role": "assistant",
                "content": "I'll help you find a police station.",
            },
            "done": True,
            "prompt_eval_count": 100,
            "eval_count": 20,
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            from app.llm.models import LLMMessage
            result = await provider.chat(
                messages=[LLMMessage(role="user", content="Find police station")]
            )

        assert result.content == "I'll help you find a police station."
        assert result.tool_calls == []
        assert result.finish_reason == "stop"
        assert result.model == "qwen2.5:3b"

    @pytest.mark.asyncio
    async def test_chat_returns_native_tool_calls(self):
        provider = self._make_provider()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "qwen2.5:3b",
            "message": {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "function": {
                            "name": "find_nearest_place",
                            "arguments": {"category": "hospital", "latitude": 12.97, "longitude": 77.59},
                        }
                    }
                ],
            },
            "done": True,
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            from app.llm.models import LLMMessage
            result = await provider.chat(
                messages=[LLMMessage(role="user", content="Find hospital")]
            )

        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].function.name == "find_nearest_place"
        assert result.finish_reason == "tool_calls"

    @pytest.mark.asyncio
    async def test_chat_fallback_json_tool_call(self):
        """When Ollama doesn't use native tool calling, extract from text."""
        provider = self._make_provider()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "qwen2.5:3b",
            "message": {
                "role": "assistant",
                "content": '```json\n{"name": "find_nearest_place", "arguments": {"category": "police_station", "latitude": 12.97, "longitude": 77.59}}\n```',
            },
            "done": True,
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            from app.llm.models import LLMMessage
            result = await provider.chat(
                messages=[LLMMessage(role="user", content="Find police station")]
            )

        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].function.name == "find_nearest_place"
        assert result.finish_reason == "tool_calls"

    @pytest.mark.asyncio
    async def test_chat_connection_error(self):
        provider = self._make_provider()
        with patch.object(provider._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = httpx.ConnectError("Connection refused")
            from app.llm.models import LLMMessage
            with pytest.raises(httpx.ConnectError):
                await provider.chat(
                    messages=[LLMMessage(role="user", content="Hello")]
                )

    @pytest.mark.asyncio
    async def test_chat_includes_tools_in_payload(self):
        provider = self._make_provider()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "model": "qwen2.5:3b",
            "message": {"role": "assistant", "content": "I'll help."},
            "done": True,
        }
        mock_response.raise_for_status = MagicMock()

        with patch.object(provider._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            from app.llm.models import LLMMessage, ToolDefinition, ToolFunction
            tools = [
                ToolDefinition(
                    function=ToolFunction(
                        name="find_nearest_place",
                        description="Find nearest POI",
                        parameters={"type": "object", "properties": {}},
                    )
                )
            ]
            await provider.chat(
                messages=[LLMMessage(role="user", content="Hello")],
                tools=tools,
            )
            # Verify tools were passed in the payload
            call_kwargs = mock_post.call_args.kwargs
            assert "tools" in call_kwargs["json"]
            assert len(call_kwargs["json"]["tools"]) == 1

    @pytest.mark.asyncio
    async def test_close(self):
        provider = self._make_provider()
        with patch.object(provider._client, "aclose", new_callable=AsyncMock) as mock_close:
            await provider.close()
            mock_close.assert_called_once()


# ---------------------------------------------------------------------------
# Streaming tests
# ---------------------------------------------------------------------------


class TestOllamaStreaming:
    def _make_provider(self):
        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="qwen2.5:3b",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            from app.llm.ollama_provider import OllamaProvider
            return OllamaProvider()

    @pytest.mark.asyncio
    async def test_stream_yields_chunks(self):
        provider = self._make_provider()

        # Simulate Ollama streaming response
        chunks = [
            '{"model":"qwen2.5:3b","message":{"role":"assistant","content":"Hello"},"done":false}',
            '{"model":"qwen2.5:3b","message":{"role":"assistant","content":" world"},"done":true,"prompt_eval_count":10,"eval_count":5}',
        ]

        async def mock_aiter_lines():
            for chunk in chunks:
                yield chunk

        mock_response = AsyncMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.aiter_lines = mock_aiter_lines

        mock_stream_ctx = AsyncMock()
        mock_stream_ctx.__aenter__ = AsyncMock(return_value=mock_response)
        mock_stream_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch.object(provider._client, "stream", return_value=mock_stream_ctx):
            from app.llm.models import LLMMessage
            collected = []
            async for chunk in provider.stream(
                messages=[LLMMessage(role="user", content="Hello")]
            ):
                collected.append(chunk)

        # Should have content deltas + final finish chunk
        content_chunks = [c for c in collected if c.content_delta]
        assert len(content_chunks) == 2
        assert content_chunks[0].content_delta == "Hello"
        assert content_chunks[1].content_delta == " world"

        # Last chunk should have finish_reason
        finish_chunks = [c for c in collected if c.finish_reason]
        assert len(finish_chunks) == 1
        assert finish_chunks[0].finish_reason == "stop"


# ---------------------------------------------------------------------------
# Agent integration with Ollama provider
# ---------------------------------------------------------------------------


class TestAgentWithOllama:
    @pytest.mark.asyncio
    async def test_agent_selects_ollama_provider(self):
        """Verify the agent works with OllamaProvider via the factory."""
        from unittest.mock import AsyncMock, patch
        from app.llm.ollama_provider import OllamaProvider
        from app.agent.agent import GeoAIAgent
        from app.llm.models import LLMMessage, LLMResponse

        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="qwen2.5:3b",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            provider = OllamaProvider()

        # Mock the provider's chat to return text
        mock_response = LLMResponse(
            content="Please share your location.",
            tool_calls=[],
            finish_reason="stop",
        )

        with patch.object(provider, "chat", new_callable=AsyncMock, return_value=mock_response):
            with patch("app.agent.agent.load_tools", new_callable=AsyncMock) as mock_tools:
                mock_tools.return_value = []
                with patch("app.agent.agent.MemoryManager") as MockMemory:
                    mock_mem = AsyncMock()
                    mock_mem.get_context_messages.return_value = []
                    mock_mem.get_last_location.return_value = None
                    MockMemory.return_value = mock_mem

                    agent = GeoAIAgent(llm=provider, session_id="test-ollama")
                    result = await agent.run("Hello")

        assert result["answer"] == "Please share your location."
        assert result["tool_used"] is None

    @pytest.mark.asyncio
    async def test_agent_json_tool_call_fallback(self):
        """Agent correctly handles JSON text tool calls from Ollama."""
        from unittest.mock import AsyncMock, patch
        from app.llm.ollama_provider import OllamaProvider
        from app.agent.agent import GeoAIAgent
        from app.llm.models import LLMMessage, LLMResponse, ToolCall, ToolCallFunction
        import json as _json

        with patch("app.llm.ollama_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                ollama_model="qwen2.5:3b",
                ollama_url="http://localhost:11434",
                ollama_temperature=0.1,
                ollama_num_ctx=4096,
                ollama_timeout=10,
            )
            provider = OllamaProvider()

        # First call: extract tool call from text fallback
        tool_call_response = LLMResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call_ollama_123",
                    function=ToolCallFunction(
                        name="find_nearest_place",
                        arguments=_json.dumps({
                            "category": "hospital",
                            "latitude": 12.9716,
                            "longitude": 77.5946,
                        }),
                    ),
                )
            ],
            finish_reason="tool_calls",
        )

        final_response = LLMResponse(
            content="The nearest hospital is Victoria Hospital, 2.1km away.",
            tool_calls=[],
            finish_reason="stop",
        )

        with patch.object(provider, "chat", new_callable=AsyncMock, side_effect=[tool_call_response, final_response]):
            with patch("app.agent.agent.load_tools", new_callable=AsyncMock) as mock_tools:
                mock_tools.return_value = []
                with patch("app.agent.agent.MemoryManager") as MockMemory:
                    mock_mem = AsyncMock()
                    mock_mem.get_context_messages.return_value = []
                    mock_mem.get_last_location.return_value = None
                    MockMemory.return_value = mock_mem
                    with patch("app.agent.agent.ToolExecutor") as MockExec:
                        mock_exec = AsyncMock()
                        mock_exec.execute.return_value = {
                            "status": "success",
                            "tool": "find_nearest_place",
                            "result": {"results": [{"name": "Victoria Hospital", "distance_meters": 2100, "location": {"lat": 12.96, "lon": 77.58}}]},
                        }
                        MockExec.return_value = mock_exec

                        agent = GeoAIAgent(llm=provider, session_id="test-ollama-fallback")
                        result = await agent.run("Find hospital near me")

        assert result["tool_used"] == "find_nearest_place"
        assert "Victoria Hospital" in result["answer"]
