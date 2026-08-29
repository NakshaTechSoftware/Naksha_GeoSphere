"""Tests for the OpenCode Zen LLM provider.

Covers: provider instantiation, factory integration, chat, streaming,
error handling, and agent compatibility — all without a live API.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.llm.models import LLMMessage, LLMResponse, ToolCall, ToolCallFunction


# ---------------------------------------------------------------------------
# Provider factory tests
# ---------------------------------------------------------------------------


class TestProviderFactoryOpencode:
    def test_factory_selects_opencode(self):
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="opencode")
            from app.llm.factory import get_provider
            provider = get_provider("opencode")
            from app.llm.opencode_provider import OpenCodeProvider
            assert isinstance(provider, OpenCodeProvider)

    def test_factory_uses_env_default_opencode(self):
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="opencode")
            from app.llm.factory import get_provider
            provider = get_provider()  # No arg — uses settings
            from app.llm.opencode_provider import OpenCodeProvider
            assert isinstance(provider, OpenCodeProvider)

    def test_provider_info_opencode(self):
        from app.llm.factory import get_provider_info
        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                llm_provider="opencode",
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                openai_model="gpt-4.1",
                openai_base_url=None,
                ollama_url="http://localhost:11434",
                ollama_model="qwen2.5:3b",
            )
            info = get_provider_info()
            assert info["provider"] == "opencode"
            assert info["model"] == "mimo-v2.5-free"
            assert "opencode.ai" in info["base_url"]

    def test_factory_rejects_unknown(self):
        with pytest.raises(ValueError, match="Unsupported"):
            from app.llm.factory import get_provider
            get_provider("groq")


# ---------------------------------------------------------------------------
# OpenCode provider — initialization
# ---------------------------------------------------------------------------


class TestOpenCodeProviderInit:
    def test_init_configures_correctly(self):
        with patch("app.llm.opencode_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                opencode_api_key="sk-oc-test",
                opencode_temperature=0.1,
                opencode_max_tokens=4096,
                opencode_timeout=60,
            )
            from app.llm.opencode_provider import OpenCodeProvider
            provider = OpenCodeProvider()
            assert provider._model == "mimo-v2.5-free"
            assert provider._temperature == 0.1
            assert provider._max_tokens == 4096


# ---------------------------------------------------------------------------
# Chat method tests (mocked OpenAI SDK)
# ---------------------------------------------------------------------------


class TestOpenCodeChat:
    def _make_provider(self):
        with patch("app.llm.opencode_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                opencode_api_key="sk-oc-test",
                opencode_temperature=0.1,
                opencode_max_tokens=4096,
                opencode_timeout=60,
            )
            from app.llm.opencode_provider import OpenCodeProvider
            return OpenCodeProvider()

    @pytest.mark.asyncio
    async def test_chat_returns_text_response(self):
        provider = self._make_provider()

        # Build a proper mock that mimics the OpenAI response structure
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 50
        mock_usage.completion_tokens = 20
        mock_usage.total_tokens = 70

        mock_message = MagicMock()
        mock_message.content = "I'll help you find a police station."
        mock_message.tool_calls = None

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage
        mock_response.model = "mimo-v2.5-free"
        mock_response.model_dump.return_value = {
            "model": "mimo-v2.5-free",
            "choices": [{"message": {"content": "I'll help"}, "finish_reason": "stop"}],
        }

        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            result = await provider.chat(
                messages=[LLMMessage(role="user", content="Find police station")]
            )

        assert result.content == "I'll help you find a police station."
        assert result.tool_calls == []
        assert result.finish_reason == "stop"
        assert result.model == "mimo-v2.5-free"
        assert result.usage["total_tokens"] == 70

    @pytest.mark.asyncio
    async def test_chat_returns_tool_calls(self):
        provider = self._make_provider()

        mock_tc = MagicMock()
        mock_tc.id = "call_oc_123"
        mock_tc.function.name = "find_nearest_place"
        mock_tc.function.arguments = json.dumps({
            "category": "hospital",
            "latitude": 12.97,
            "longitude": 77.59,
        })

        mock_message = MagicMock()
        mock_message.content = None
        mock_message.tool_calls = [mock_tc]

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "tool_calls"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = None
        mock_response.model = "mimo-v2.5-free"
        mock_response.model_dump.return_value = {"model": "mimo-v2.5-free"}

        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            result = await provider.chat(
                messages=[LLMMessage(role="user", content="Find hospital")]
            )

        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].function.name == "find_nearest_place"
        assert result.finish_reason == "tool_calls"

    @pytest.mark.asyncio
    async def test_chat_includes_tools_in_payload(self):
        provider = self._make_provider()

        mock_message = MagicMock()
        mock_message.content = "I'll help."
        mock_message.tool_calls = None

        mock_choice = MagicMock()
        mock_choice.message = mock_message
        mock_choice.finish_reason = "stop"

        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = None
        mock_response.model = "mimo-v2.5-free"
        mock_response.model_dump.return_value = {"model": "mimo-v2.5-free"}

        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = mock_response
            from app.llm.models import ToolDefinition, ToolFunction
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
            call_kwargs = mock_create.call_args.kwargs
            assert "tools" in call_kwargs
            assert len(call_kwargs["tools"]) == 1

    @pytest.mark.asyncio
    async def test_chat_auth_error(self):
        provider = self._make_provider()
        import openai
        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = openai.AuthenticationError(
                message="Invalid API key",
                response=MagicMock(status_code=401),
                body=None,
            )
            with pytest.raises(openai.AuthenticationError):
                await provider.chat(
                    messages=[LLMMessage(role="user", content="Hello")]
                )

    @pytest.mark.asyncio
    async def test_chat_rate_limit_error(self):
        provider = self._make_provider()
        import openai
        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = openai.RateLimitError(
                message="Rate limited",
                response=MagicMock(status_code=429),
                body=None,
            )
            with pytest.raises(openai.RateLimitError):
                await provider.chat(
                    messages=[LLMMessage(role="user", content="Hello")]
                )

    @pytest.mark.asyncio
    async def test_chat_connection_error(self):
        provider = self._make_provider()
        import openai
        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = openai.APIConnectionError(request=MagicMock())
            with pytest.raises(openai.APIConnectionError):
                await provider.chat(
                    messages=[LLMMessage(role="user", content="Hello")]
                )

    @pytest.mark.asyncio
    async def test_chat_timeout_error(self):
        provider = self._make_provider()
        import openai
        with patch.object(provider._client.chat.completions, "create", new_callable=AsyncMock) as mock_create:
            mock_create.side_effect = openai.APITimeoutError(request=MagicMock())
            with pytest.raises(openai.APITimeoutError):
                await provider.chat(
                    messages=[LLMMessage(role="user", content="Hello")]
                )

    @pytest.mark.asyncio
    async def test_close(self):
        provider = self._make_provider()
        with patch.object(provider._client, "close", new_callable=AsyncMock) as mock_close:
            with patch.object(provider._stream_client, "close", new_callable=AsyncMock):
                await provider.close()
                mock_close.assert_called_once()


# ---------------------------------------------------------------------------
# Streaming tests
# ---------------------------------------------------------------------------


class TestOpenCodeStreaming:
    def _make_provider(self):
        with patch("app.llm.opencode_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                opencode_api_key="sk-oc-test",
                opencode_temperature=0.1,
                opencode_max_tokens=4096,
                opencode_timeout=60,
            )
            from app.llm.opencode_provider import OpenCodeProvider
            return OpenCodeProvider()

    @pytest.mark.asyncio
    async def test_stream_yields_content_chunks(self):
        provider = self._make_provider()

        # Build mock stream chunks
        def _make_stream_chunk(content, finish_reason=None):
            chunk = MagicMock()
            chunk.choices = [MagicMock()]
            chunk.choices[0].delta.content = content
            chunk.choices[0].delta.tool_calls = None
            chunk.choices[0].finish_reason = finish_reason
            return chunk

        chunks = [
            _make_stream_chunk("Hello"),
            _make_stream_chunk(" world"),
            _make_stream_chunk(None, "stop"),
        ]

        async def mock_aiter():
            for c in chunks:
                yield c

        # The OpenAI SDK's create(stream=True) returns an async iterator directly
        mock_stream = mock_aiter()

        with patch.object(
            provider._stream_client.chat.completions, "create",
            new_callable=AsyncMock,
            return_value=mock_stream,
        ):
            collected = []
            async for chunk in provider.stream(
                messages=[LLMMessage(role="user", content="Hello")]
            ):
                collected.append(chunk)

        content_chunks = [c for c in collected if c.content_delta]
        assert len(content_chunks) == 2
        assert content_chunks[0].content_delta == "Hello"
        assert content_chunks[1].content_delta == " world"

    @pytest.mark.asyncio
    async def test_stream_with_tool_calls(self):
        provider = self._make_provider()

        tc_delta = MagicMock()
        tc_delta.index = 0
        tc_delta.id = "call_stream_123"
        tc_delta.function = MagicMock()
        tc_delta.function.name = "find_nearest_place"
        tc_delta.function.arguments = '{"category": "hospital"}'

        # Use a real list for tool_calls so iteration works correctly
        delta1 = MagicMock()
        delta1.content = None
        delta1.tool_calls = [tc_delta]

        choice1 = MagicMock()
        choice1.delta = delta1
        choice1.finish_reason = None

        delta2 = MagicMock()
        delta2.content = None
        delta2.tool_calls = []
        delta2.finish_reason = "stop"

        choice2 = MagicMock()
        choice2.delta = delta2
        choice2.finish_reason = "stop"

        chunk1 = MagicMock()
        chunk1.choices = [choice1]

        chunk2 = MagicMock()
        chunk2.choices = [choice2]

        async def mock_aiter():
            yield chunk1
            yield chunk2

        mock_stream = mock_aiter()

        with patch.object(
            provider._stream_client.chat.completions, "create",
            new_callable=AsyncMock,
            return_value=mock_stream,
        ):
            collected = []
            async for chunk in provider.stream(
                messages=[LLMMessage(role="user", content="Find hospital")]
            ):
                collected.append(chunk)

        # Should have finish chunk with accumulated tool calls
        finish_chunks = [c for c in collected if c.finish_reason == "tool_calls"]
        assert len(finish_chunks) == 1
        assert len(finish_chunks[0].tool_calls) == 1
        assert finish_chunks[0].tool_calls[0].function.name == "find_nearest_place"

    @pytest.mark.asyncio
    async def test_stream_connection_error(self):
        provider = self._make_provider()
        import openai
        with patch.object(
            provider._stream_client.chat.completions, "create",
            side_effect=openai.APIConnectionError(request=MagicMock()),
        ):
            with pytest.raises(openai.APIConnectionError):
                async for _ in provider.stream(
                    messages=[LLMMessage(role="user", content="Hello")]
                ):
                    pass


# ---------------------------------------------------------------------------
# Agent integration with OpenCode provider
# ---------------------------------------------------------------------------


class TestAgentWithOpenCode:
    @pytest.mark.asyncio
    async def test_agent_works_with_opencode_provider(self):
        """Verify the agent loop works seamlessly with OpenCodeProvider."""
        from app.llm.opencode_provider import OpenCodeProvider
        from app.agent.agent import GeoAIAgent

        with patch("app.llm.opencode_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                opencode_api_key="sk-oc-test",
                opencode_temperature=0.1,
                opencode_max_tokens=4096,
                opencode_timeout=60,
            )
            provider = OpenCodeProvider()

        mock_response = LLMResponse(
            content="Please share your location so I can help.",
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

                    agent = GeoAIAgent(llm=provider, session_id="test-opencode")
                    result = await agent.run("Hello")

        assert result["answer"] == "Please share your location so I can help."
        assert result["tool_used"] is None

    @pytest.mark.asyncio
    async def test_agent_tool_call_with_opencode(self):
        """Agent executes tool calls from OpenCode provider correctly."""
        from app.llm.opencode_provider import OpenCodeProvider
        from app.agent.agent import GeoAIAgent

        with patch("app.llm.opencode_provider.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(
                opencode_model="mimo-v2.5-free",
                opencode_base_url="https://opencode.ai/zen/v1",
                opencode_api_key="sk-oc-test",
                opencode_temperature=0.1,
                opencode_max_tokens=4096,
                opencode_timeout=60,
            )
            provider = OpenCodeProvider()

        tool_call_response = LLMResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call_oc_tool_123",
                    function=ToolCallFunction(
                        name="find_nearest_place",
                        arguments=json.dumps({
                            "category": "police_station",
                            "latitude": 12.9716,
                            "longitude": 77.5946,
                            "radius": 5000,
                        }),
                    ),
                )
            ],
            finish_reason="tool_calls",
        )

        final_response = LLMResponse(
            content="The nearest police station is Indiranagar PS, 1.2km away.",
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
                            "result": {
                                "results": [{
                                    "name": "Indiranagar Police Station",
                                    "distance_meters": 1200,
                                    "location": {"lat": 12.9784, "lon": 77.6408},
                                }]
                            },
                        }
                        MockExec.return_value = mock_exec

                        agent = GeoAIAgent(llm=provider, session_id="test-oc-tools")
                        result = await agent.run("Find police station near me")

        assert result["tool_used"] == "find_nearest_place"
        assert "Indiranagar" in result["answer"]


# ---------------------------------------------------------------------------
# Provider switching tests
# ---------------------------------------------------------------------------


class TestProviderSwitching:
    def test_switch_from_openai_to_opencode(self):
        """Verify switching via env var changes the provider."""
        from app.llm.factory import get_provider

        with patch("app.llm.factory.get_settings") as mock_settings:
            # First: OpenAI
            mock_settings.return_value = MagicMock(llm_provider="openai")
            p1 = get_provider()
            from app.llm.openai_provider import OpenAIProvider
            assert isinstance(p1, OpenAIProvider)

        with patch("app.llm.factory.get_settings") as mock_settings:
            # Then: OpenCode
            mock_settings.return_value = MagicMock(llm_provider="opencode")
            p2 = get_provider()
            from app.llm.opencode_provider import OpenCodeProvider
            assert isinstance(p2, OpenCodeProvider)

    def test_switch_from_opencode_to_openai(self):
        """Verify switching back works."""
        from app.llm.factory import get_provider

        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="opencode")
            from app.llm.opencode_provider import OpenCodeProvider
            assert isinstance(get_provider(), OpenCodeProvider)

        with patch("app.llm.factory.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(llm_provider="openai")
            from app.llm.openai_provider import OpenAIProvider
            assert isinstance(get_provider(), OpenAIProvider)

    def test_all_three_providers(self):
        """Verify all three providers can be instantiated."""
        from app.llm.factory import get_provider

        for name, cls_name in [
            ("openai", "OpenAIProvider"),
            ("ollama", "OllamaProvider"),
            ("opencode", "OpenCodeProvider"),
        ]:
            with patch("app.llm.factory.get_settings") as mock_settings:
                mock_settings.return_value = MagicMock(llm_provider=name)
                provider = get_provider()
                assert provider.__class__.__name__ == cls_name
