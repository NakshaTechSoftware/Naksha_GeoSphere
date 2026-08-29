"""AI tool definitions + a single dispatch endpoint (Feature 3).

GET  /geoai/tools/definitions -> OpenAI function-calling compatible JSON
                                  schemas for all five tools.
POST /geoai/tools/execute     -> {"name": ..., "arguments": {...}} dispatcher,
                                  the shape most LLM function-calling loops
                                  already produce, so the agent runtime can
                                  forward a tool call here verbatim instead
                                  of hand-mapping each tool to a bespoke route.

Each individual capability is also reachable as its own REST endpoint
(app/api/nearby.py, spatial_query.py, geocode.py) for callers that prefer
that shape — this file is a convenience layer on top of the same services.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import GeoAIError
from app.core.logging import ToolCallLogger
from app.core.rate_limit import enforce_rate_limit
from app.database.postgres import get_db_session
from app.schemas.geoai_models import (
    LatLon,
    NearbyResponse,
    SpatialFeature,
    ToolExecuteRequest,
    ToolExecuteResponse,
)
from app.services import geo_service
from app.services.nearby_service import find_nearby
from app.services.spatial_service import query_layer

router = APIRouter(prefix="/geoai/tools", tags=["ai-tools"])

# ---------------------------------------------------------------------------
# OpenAI function-calling compatible tool schemas.
# See docs/AI_FUNCTION_CALLING.md for full worked examples of each call.
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "reverse_geocode",
            "description": "Convert a latitude/longitude pair into a human-readable address or place name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {"type": "number", "description": "Latitude, WGS84."},
                    "lon": {"type": "number", "description": "Longitude, WGS84."},
                },
                "required": ["lat", "lon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_place",
            "description": "Resolve a place name or address typed by the user into coordinates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text place name or address."}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_nearest_place",
            "description": (
                "Find the nearest points of interest of a given category to a location, "
                "within a radius, sorted by distance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "enum": ["police_station", "hospital", "school", "atm", "pharmacy"],
                    },
                    "latitude": {"type": "number"},
                    "longitude": {"type": "number"},
                    "radius": {
                        "type": "integer",
                        "description": "Search radius in meters.",
                        "default": 2000,
                    },
                },
                "required": ["category", "latitude", "longitude"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_spatial_layer",
            "description": (
                "Answer 'which administrative area contains this point' questions, e.g. "
                "which district, taluk, hobli, village, ward, gram panchayat, postal code "
                "(PIN code), police jurisdiction, assembly constituency, or parliamentary "
                "constituency a coordinate falls inside."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "layer": {
                        "type": "string",
                        "enum": [
                            "district",
                            "taluk",
                            "hobli",
                            "village",
                            "ward",
                            "gram_panchayat",
                            "postal_code",
                            "police_jurisdiction",
                            "assembly_constituency",
                            "parliamentary_constituency",
                        ],
                    },
                    "geometry": {
                        "type": "array",
                        "items": {"type": "number"},
                        "minItems": 2,
                        "maxItems": 2,
                        "description": "[longitude, latitude] point to test.",
                    },
                    "operation": {
                        "type": "string",
                        "enum": ["point_in_polygon", "intersects", "contains", "within"],
                        "default": "point_in_polygon",
                    },
                },
                "required": ["layer", "geometry"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_route",
            "description": "Get driving/walking/cycling directions between two points.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "object",
                        "properties": {"lat": {"type": "number"}, "lon": {"type": "number"}},
                        "required": ["lat", "lon"],
                    },
                    "destination": {
                        "type": "object",
                        "properties": {"lat": {"type": "number"}, "lon": {"type": "number"}},
                        "required": ["lat", "lon"],
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["driving", "walking", "cycling"],
                        "default": "driving",
                    },
                },
                "required": ["origin", "destination"],
            },
        },
    },
]


@router.get("/definitions")
async def tool_definitions(api_key: str = Depends(enforce_rate_limit)) -> list[dict[str, Any]]:
    return TOOL_DEFINITIONS


@router.post("/execute", response_model=ToolExecuteResponse)
async def execute_tool(
    payload: ToolExecuteRequest,
    api_key: str = Depends(enforce_rate_limit),
    session: AsyncSession = Depends(get_db_session),
) -> ToolExecuteResponse:
    args = payload.arguments
    with ToolCallLogger.timed(payload.name, payload.session_id or api_key, args):
        try:
            result = await _dispatch(payload.name, args, session)
            return ToolExecuteResponse(status="success", tool=payload.name, result=result)
        except GeoAIError as exc:
            return ToolExecuteResponse(status="error", tool=payload.name, error=exc.message)


async def _dispatch(name: str, args: dict[str, Any], session: AsyncSession) -> dict[str, Any]:
    if name == "reverse_geocode":
        return await geo_service.reverse_geocode(args["lat"], args["lon"])

    if name == "search_place":
        return {"results": await geo_service.search_place(args["query"])}

    if name == "find_nearest_place":
        results, source = await find_nearby(
            session,
            args["category"],
            args["latitude"],
            args["longitude"],
            args.get("radius", 2000),
            args.get("limit", 10),
        )
        return NearbyResponse(results=results, cached=False).model_dump() | {"source": source}

    if name == "query_spatial_layer":
        lon, lat = args["geometry"]
        feature, source = await query_layer(
            session, args["layer"], lon, lat, args.get("operation", "point_in_polygon")
        )
        return {
            "layer": args["layer"],
            "feature": (feature or SpatialFeature()).model_dump(),
            "source": source,
        }

    if name == "get_route":
        origin = LatLon(**args["origin"])
        destination = LatLon(**args["destination"])
        return await geo_service.get_route(
            (origin.lat, origin.lon), (destination.lat, destination.lon), args.get("mode", "driving")
        )

    raise GeoAIError(f"Unknown tool: '{name}'", error_code="unknown_tool")
