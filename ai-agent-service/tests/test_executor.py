"""Tests for ToolExecutor's location backfill (fixes the "please share your
coordinates" regression: a location-dependent tool call missing lat/lon
should be filled in from the session's last known location, not surfaced
back to the user as a request for input we already have)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.agent.executor import ToolExecutor


class _FakeMemory:
    def __init__(self, location: dict[str, float] | None) -> None:
        self._location = location

    async def get_last_location(self) -> dict[str, float] | None:
        return self._location


@pytest.mark.asyncio
async def test_find_nearest_place_backfills_missing_coordinates() -> None:
    memory = _FakeMemory({"lat": 12.9716, "lon": 77.5946})
    executor = ToolExecutor(session_id="s1", memory=memory)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "find_nearest_place", "result": {}}
        await executor.execute(
            "find_nearest_place", json.dumps({"category": "police_station"})
        )

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["latitude"] == 12.9716
    assert called_args["longitude"] == 77.5946


@pytest.mark.asyncio
async def test_find_nearest_place_leaves_explicit_coordinates_untouched() -> None:
    memory = _FakeMemory({"lat": 0.0, "lon": 0.0})
    executor = ToolExecutor(session_id="s1", memory=memory)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "find_nearest_place", "result": {}}
        await executor.execute(
            "find_nearest_place",
            json.dumps({"category": "hospital", "latitude": 13.5, "longitude": 78.1}),
        )

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["latitude"] == 13.5
    assert called_args["longitude"] == 78.1


@pytest.mark.asyncio
async def test_query_spatial_layer_backfills_missing_geometry() -> None:
    memory = _FakeMemory({"lat": 12.97, "lon": 77.59})
    executor = ToolExecutor(session_id="s1", memory=memory)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "query_spatial_layer", "result": {}}
        await executor.execute("query_spatial_layer", json.dumps({"layer": "district"}))

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["geometry"] == [77.59, 12.97]


@pytest.mark.asyncio
async def test_no_memory_means_no_backfill_attempted() -> None:
    executor = ToolExecutor(session_id="s1", memory=None)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "error", "tool": "find_nearest_place", "error": "missing args"}
        await executor.execute("find_nearest_place", json.dumps({"category": "atm"}))

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert "latitude" not in called_args


@pytest.mark.asyncio
async def test_query_spatial_layer_corrects_swapped_geometry() -> None:
    """Regression: the small local model sometimes emits [lat, lon] instead
    of the required [lon, lat] despite the schema saying so explicitly
    (e.g. sent [12.9716, 77.5946] for a Bengaluru point). Both values are
    structurally valid numbers, so the earlier "is it missing" check alone
    can't catch this — India's lon/lat ranges don't overlap, so it can be
    detected and corrected instead of silently querying the wrong point."""
    executor = ToolExecutor(session_id="s1", memory=None)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "query_spatial_layer", "result": {}}
        await executor.execute(
            "query_spatial_layer",
            json.dumps({"layer": "district", "geometry": [12.9716, 77.5946]}),
        )

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["geometry"] == [77.5946, 12.9716]


@pytest.mark.asyncio
async def test_query_spatial_layer_leaves_correct_geometry_untouched() -> None:
    executor = ToolExecutor(session_id="s1", memory=None)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "query_spatial_layer", "result": {}}
        await executor.execute(
            "query_spatial_layer",
            json.dumps({"layer": "district", "geometry": [77.5946, 12.9716]}),
        )

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["geometry"] == [77.5946, 12.9716]


@pytest.mark.asyncio
async def test_find_nearest_place_corrects_swapped_lat_lon() -> None:
    executor = ToolExecutor(session_id="s1", memory=None)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "success", "tool": "find_nearest_place", "result": {}}
        await executor.execute(
            "find_nearest_place",
            json.dumps({"category": "hospital", "latitude": 77.5946, "longitude": 12.9716}),
        )

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert called_args["latitude"] == 12.9716
    assert called_args["longitude"] == 77.5946


@pytest.mark.asyncio
async def test_no_stored_location_leaves_arguments_unchanged() -> None:
    memory = _FakeMemory(None)
    executor = ToolExecutor(session_id="s1", memory=memory)

    with patch("app.agent.executor.execute_tool", new_callable=AsyncMock) as mock_exec:
        mock_exec.return_value = {"status": "error", "tool": "find_nearest_place", "error": "missing args"}
        await executor.execute("find_nearest_place", json.dumps({"category": "school"}))

    called_args = mock_exec.call_args.kwargs["arguments"]
    assert "latitude" not in called_args
