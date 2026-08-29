"""Unit tests for the AI Agent orchestration.

Tests the agent loop, tool execution, and map action extraction
without making real LLM or GeoAI service calls.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import httpx

from app.agent.agent import GeoAIAgent
from app.agent.executor import ToolExecutor
from app.llm.models import LLMMessage, LLMResponse, ToolCall, ToolCallFunction


# ---------------------------------------------------------------------------
# ToolExecutor tests
# ---------------------------------------------------------------------------


class TestToolExecutor:
    @pytest.mark.asyncio
    async def test_execute_parses_json_arguments(self):
        executor = ToolExecutor(session_id="test")
        with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
            mock_exec.return_value = {
                "status": "success",
                "tool": "find_nearest_place",
                "result": {"results": []},
            }
            result = await executor.execute(
                "find_nearest_place",
                json.dumps({"category": "hospital", "latitude": 12.97, "longitude": 77.59}),
            )
            mock_exec.assert_called_once_with(
                name="find_nearest_place",
                arguments={"category": "hospital", "latitude": 12.97, "longitude": 77.59},
                session_id="test",
            )
            assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_execute_handles_invalid_json(self):
        executor = ToolExecutor(session_id="test")
        result = await executor.execute("find_nearest_place", "not valid json {{{")
        assert result["status"] == "error"
        assert "Invalid arguments JSON" in result["error"]

    @pytest.mark.asyncio
    async def test_execute_handles_service_error(self):
        executor = ToolExecutor(session_id="test")
        with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
            mock_exec.side_effect = httpx.ConnectError("Connection refused")
            result = await executor.execute("find_nearest_place", "{}")
            assert result["status"] == "error"


# ---------------------------------------------------------------------------
# Agent loop tests
# ---------------------------------------------------------------------------


class TestGeoAIAgent:
    def _make_llm(self, responses: list[LLMResponse]) -> MagicMock:
        llm = AsyncMock()
        llm.chat = AsyncMock(side_effect=responses)
        llm.close = AsyncMock()
        return llm

    @pytest.mark.asyncio
    async def test_simple_text_response(self):
        """Agent returns text when LLM makes no tool calls."""
        llm_response = LLMResponse(
            content="Please share your location so I can help you.",
            tool_calls=[],
            finish_reason="stop",
        )
        llm = self._make_llm([llm_response])

        with patch("app.agent.agent.load_tools", new_callable=AsyncMock) as mock_tools:
            mock_tools.return_value = []
            with patch("app.agent.agent.MemoryManager") as MockMemory:
                mock_mem = AsyncMock()
                mock_mem.get_context_messages.return_value = []
                mock_mem.get_last_location.return_value = None
                MockMemory.return_value = mock_mem

                agent = GeoAIAgent(llm=llm, session_id="test-1")
                result = await agent.run("Hello")

        assert result["answer"] == "Please share your location so I can help you."
        assert result["tool_used"] is None

    @pytest.mark.asyncio
    async def test_tool_calling_loop(self):
        """Agent calls tool when LLM requests it, then returns final answer."""
        # First LLM call: wants to call find_nearest_place
        tool_call_response = LLMResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call_abc123",
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

        # Second LLM call: final answer
        final_response = LLMResponse(
            content="The nearest police station is Indiranagar Police Station, 1.2km away.",
            tool_calls=[],
            finish_reason="stop",
        )

        llm = self._make_llm([tool_call_response, final_response])

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

                    agent = GeoAIAgent(llm=llm, session_id="test-2")
                    result = await agent.run("Find police station near me")

        assert result["tool_used"] == "find_nearest_place"
        assert "Indiranagar" in result["answer"]

    @pytest.mark.asyncio
    async def test_tool_error_with_null_result_does_not_crash(self):
        """Regression: a GeoAI tool error response has `"result": null` (present,
        not absent) — `result.get("result", {})` does NOT substitute the default
        for a present-but-None key, so this used to crash with AttributeError:
        'NoneType' object has no attribute 'get' every time any tool call failed.
        """
        tool_call_response = LLMResponse(
            content=None,
            tool_calls=[
                ToolCall(
                    id="call_err1",
                    function=ToolCallFunction(
                        name="query_spatial_layer",
                        arguments=json.dumps({"layer": "postal_code", "geometry": [77.59, 12.97]}),
                    ),
                )
            ],
            finish_reason="tool_calls",
        )
        final_response = LLMResponse(
            content="I couldn't find that postal code boundary.",
            tool_calls=[],
            finish_reason="stop",
        )
        llm = self._make_llm([tool_call_response, final_response])

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
                        "status": "error",
                        "tool": "query_spatial_layer",
                        "result": None,
                        "error": "No 'postal_code' feature found containing the given point.",
                    }
                    MockExec.return_value = mock_exec

                    agent = GeoAIAgent(llm=llm, session_id="test-3")
                    result = await agent.run("What's my postal code?")

        assert result["tool_used"] == "query_spatial_layer"
        assert "couldn't find" in result["answer"]


# ---------------------------------------------------------------------------
# Map action extraction tests
# ---------------------------------------------------------------------------


class TestMapActionExtraction:
    def test_extract_json_code_block(self):
        from app.agent.agent import GeoAIAgent
        agent = GeoAIAgent.__new__(GeoAIAgent)

        text = 'Here is the result.\n```json\n{"type": "marker", "coordinates": [77.64, 12.98], "label": "Test"}\n```\nDone.'
        result = agent._extract_map_action(text)
        assert result is not None
        assert result["type"] == "marker"
        assert result["coordinates"] == [77.64, 12.98]

    def test_extract_inline_json(self):
        from app.agent.agent import GeoAIAgent
        agent = GeoAIAgent.__new__(GeoAIAgent)

        text = 'The location is {"type": "marker", "coordinates": [77.59, 12.97], "label": "Bangalore"}.'
        result = agent._extract_map_action(text)
        assert result is not None
        assert result["type"] == "marker"

    def test_no_map_action(self):
        from app.agent.agent import GeoAIAgent
        agent = GeoAIAgent.__new__(GeoAIAgent)

        text = "I couldn't find any results for your query."
        result = agent._extract_map_action(text)
        assert result is None


# ---------------------------------------------------------------------------
# Prompt tests
# ---------------------------------------------------------------------------


class TestPrompts:
    def test_system_prompt_contains_key_rules(self):
        from app.agent.prompts import get_system_prompt
        prompt = get_system_prompt()
        assert "Naksha GeoAI Assistant" in prompt
        assert "NEVER hallucinate" in prompt
        assert "find_nearest_place" in prompt
        assert "query_spatial_layer" in prompt
        assert "get_route" in prompt

    def test_system_prompt_mentions_map_action(self):
        from app.agent.prompts import get_system_prompt
        prompt = get_system_prompt()
        assert "map_action" in prompt
        assert "marker" in prompt
        assert "polygon" in prompt
        assert "route" in prompt
