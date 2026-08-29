"""Tool execution engine.

Receives tool calls from the LLM, forwards them to the GeoAI Tool
Adapter Service, and returns structured results. This is the bridge
between LLM reasoning and GIS execution.

Supports two modes:
1. Native function calling — tool_calls arrive as structured objects.
2. JSON text fallback — for models (e.g. Qwen2.5) that emit tool
   calls as JSON in the response text. The agent layer handles
   extraction; this executor just parses the arguments JSON.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from app.geoai.client import execute_tool
from app.logging.logger import get_logger

if TYPE_CHECKING:
    from app.agent.memory import MemoryManager

logger = get_logger("agent.executor")

# Loose bounding box for India, used only to detect an obviously-swapped
# [lat, lon] pair — the small local model (qwen2.5:3b) occasionally puts
# latitude and longitude in the wrong order despite the tool schema saying
# "[longitude, latitude]" explicitly (e.g. sending [12.97, 77.59] as
# geometry, or latitude=77.59/longitude=12.97). India's longitude range
# (68-98) and latitude range (6-38) don't overlap, so a pair that's only
# plausible when swapped is a reliable enough signal to just fix it.
_INDIA_LON_RANGE = (68.0, 98.0)
_INDIA_LAT_RANGE = (6.0, 38.0)


def _looks_swapped(lon: float, lat: float) -> bool:
    lon_plausible = _INDIA_LON_RANGE[0] <= lon <= _INDIA_LON_RANGE[1]
    lat_plausible = _INDIA_LAT_RANGE[0] <= lat <= _INDIA_LAT_RANGE[1]
    if lon_plausible and lat_plausible:
        return False
    swapped_lon_plausible = _INDIA_LON_RANGE[0] <= lat <= _INDIA_LON_RANGE[1]
    swapped_lat_plausible = _INDIA_LAT_RANGE[0] <= lon <= _INDIA_LAT_RANGE[1]
    return swapped_lon_plausible and swapped_lat_plausible


class ToolExecutor:
    """Executes LLM tool calls against the GeoAI backend."""

    def __init__(self, session_id: str | None = None, memory: "MemoryManager | None" = None) -> None:
        self.session_id = session_id
        self.memory = memory

    async def execute(self, name: str, arguments_json: str) -> dict[str, Any]:
        """Execute a single tool call.

        Args:
            name: The tool name (e.g. "find_nearest_place").
            arguments_json: JSON-encoded arguments string from the LLM.

        Returns:
            The full GeoAI response dict with status, result, and error fields.
        """
        # Parse the LLM's JSON arguments string
        try:
            arguments = json.loads(arguments_json) if arguments_json else {}
        except json.JSONDecodeError as e:
            logger.error("Failed to parse tool arguments: %s", e)
            return {
                "status": "error",
                "tool": name,
                "error": f"Invalid arguments JSON: {e}",
            }

        # Handle nested arguments from some models (e.g. {"arguments": {...}})
        if "arguments" in arguments and isinstance(arguments["arguments"], dict):
            arguments = arguments["arguments"]

        arguments = await self._backfill_location(name, arguments)

        logger.info(
            "Executing tool: %s (args=%s)",
            name,
            json.dumps(arguments, default=str)[:500],
        )

        try:
            result = await execute_tool(
                name=name,
                arguments=arguments,
                session_id=self.session_id,
            )
            logger.info("Tool %s completed (status=%s)", name, result.get("status"))
            return result
        except Exception as e:
            logger.error("Tool execution failed: %s", e, exc_info=True)
            return {
                "status": "error",
                "tool": name,
                "error": str(e),
            }

    async def _backfill_location(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Fill in a missing coordinate from the session's last known location.

        The system prompt always has a location available (the user's GPS
        fix, or the map center as a fallback) — but a small local model can
        still fail to copy it into a tool call, especially on a retry after
        an earlier error. Rather than surface that as "please give me your
        coordinates" to the user, use the location we already have.
        """
        # Swap-correction is a self-contained coordinate check — it needs no
        # stored location, so it must run even when self.memory is None.
        # Only the "fill in a missing coordinate" fallback below needs memory.
        if name == "find_nearest_place":
            has_lat = arguments.get("latitude") not in (None, "", 0)
            has_lon = arguments.get("longitude") not in (None, "", 0)
            if has_lat and has_lon:
                lat, lon = arguments["latitude"], arguments["longitude"]
                if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and _looks_swapped(lon, lat):
                    logger.info("Correcting swapped lat/lon for find_nearest_place")
                    return {**arguments, "latitude": lon, "longitude": lat}
                return arguments
            if self.memory is None:
                return arguments
            location = await self.memory.get_last_location()
            if location is None:
                return arguments
            logger.info("Backfilling find_nearest_place coordinates from session memory")
            arguments = {**arguments, "latitude": location["lat"], "longitude": location["lon"]}

        elif name == "query_spatial_layer":
            geometry = arguments.get("geometry")
            valid = isinstance(geometry, list) and len(geometry) == 2 and all(
                isinstance(v, (int, float)) for v in geometry
            )
            if valid:
                lon, lat = geometry
                if _looks_swapped(lon, lat):
                    logger.info("Correcting swapped [lat, lon] -> [lon, lat] for query_spatial_layer")
                    return {**arguments, "geometry": [lat, lon]}
                return arguments
            if self.memory is None:
                return arguments
            location = await self.memory.get_last_location()
            if location is None:
                return arguments
            logger.info("Backfilling query_spatial_layer geometry from session memory")
            arguments = {**arguments, "geometry": [location["lon"], location["lat"]]}

        return arguments

    async def execute_many(
        self, tool_calls: list[dict[str, str]]
    ) -> list[dict[str, Any]]:
        """Execute multiple tool calls sequentially.

        Each entry should have {"id": ..., "name": ..., "arguments": ...}.

        Returns a list of results in the same order.
        """
        results = []
        for tc in tool_calls:
            result = await self.execute(tc["name"], tc["arguments"])
            results.append(result)
        return results
