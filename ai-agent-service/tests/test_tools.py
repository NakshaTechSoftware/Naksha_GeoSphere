"""Tests for tool definition loading from the GeoAI service."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.geoai.tools import invalidate_cache, load_tools


class TestToolLoading:
    @pytest.mark.asyncio
    async def test_load_tools_converts_format(self):
        """Verify GeoAI tool definitions are converted to LLM format."""
        mock_definitions = [
            {
                "type": "function",
                "function": {
                    "name": "find_nearest_place",
                    "description": "Find nearest GIS feature",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "category": {"type": "string"},
                        },
                        "required": ["category"],
                    },
                },
            }
        ]

        with patch(
            "app.geoai.tools.fetch_tool_definitions",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.return_value = mock_definitions
            invalidate_cache()
            tools = await load_tools()

        assert len(tools) == 1
        tool = tools[0]
        assert tool.function.name == "find_nearest_place"
        assert tool.function.description == "Find nearest GIS feature"
        assert tool.function.parameters["type"] == "object"

    @pytest.mark.asyncio
    async def test_tools_are_cached(self):
        """Subsequent calls should return cached tools."""
        mock_definitions = [
            {
                "type": "function",
                "function": {
                    "name": "reverse_geocode",
                    "description": "Convert coordinates to address",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ]

        with patch(
            "app.geoai.tools.fetch_tool_definitions",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.return_value = mock_definitions
            invalidate_cache()

            tools1 = await load_tools()
            tools2 = await load_tools()

            # fetch should only be called once due to caching
            assert mock_fetch.call_count == 1
            assert tools1 is tools2

    @pytest.mark.asyncio
    async def test_load_tools_uses_stale_cache_on_error(self):
        """If fetch fails but we have cached tools, return stale cache."""
        mock_definitions = [
            {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "Test",
                    "parameters": {},
                },
            }
        ]

        with patch(
            "app.geoai.tools.fetch_tool_definitions",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.return_value = mock_definitions
            invalidate_cache()
            # First call populates cache
            await load_tools()

            # Second call fails but returns stale cache
            mock_fetch.side_effect = ConnectionError("GeoAI unreachable")
            tools = await load_tools()
            assert len(tools) == 1

    @pytest.mark.asyncio
    async def test_load_tools_raises_on_first_failure(self):
        """If no cache exists and fetch fails, raise the error."""
        with patch(
            "app.geoai.tools.fetch_tool_definitions",
            new_callable=AsyncMock,
        ) as mock_fetch:
            mock_fetch.side_effect = ConnectionError("GeoAI unreachable")
            invalidate_cache()
            with pytest.raises(ConnectionError):
                await load_tools()
