"""Pydantic v2 request/response models for the chat API.

These are the only shapes the frontend ever sees — no LLM internals,
no GeoAI service credentials, no internal URLs.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.map_actions import (
    AddLayerAction,
    FlyToAction,
    HighlightAction,
    MarkerAction,
    MapAction,
    MultiMarkerAction,
    PolygonAction,
    RouteAction,
)


# --------------------------------------------------------------------------- #
# Map context models (from frontend MapLibre GL state)
# --------------------------------------------------------------------------- #

class MapCenter(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class MapBounds(BaseModel):
    north: float = Field(default=0, ge=-90, le=90)
    south: float = Field(default=0, ge=-90, le=90)
    east: float = Field(default=0, ge=-180, le=180)
    west: float = Field(default=0, ge=-180, le=180)


class SelectedFeature(BaseModel):
    layer: str = ""
    id: str | int | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class MapContext(BaseModel):
    """Live map state from the frontend."""
    center: MapCenter | None = None
    zoom: float = Field(default=12, ge=0, le=22)
    bounds: MapBounds | None = None
    active_layers: list[str] = Field(default_factory=list)
    selected_feature: SelectedFeature | None = None


# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class UserLocation(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    user_location: UserLocation | None = Field(
        default=None,
        description="User's current GPS location for context.",
    )
    map_context: MapContext | None = Field(
        default=None,
        description="Live map state from MapLibre GL (center, zoom, layers, selection).",
    )
    session_id: str = Field(
        default_factory=lambda: "",
        description="Conversation session ID. Auto-generated if empty.",
    )


# --------------------------------------------------------------------------- #
# Map action models (re-exported from map_actions.py)
# --------------------------------------------------------------------------- #

__all__ = [
    "MarkerAction",
    "RouteAction",
    "PolygonAction",
    "HighlightAction",
    "AddLayerAction",
    "FlyToAction",
    "MultiMarkerAction",
    "MapAction",
]


# --------------------------------------------------------------------------- #
# Response models
# --------------------------------------------------------------------------- #

class ChatResponse(BaseModel):
    answer: str = Field(..., description="Natural-language answer from the agent.")
    tool_used: str | None = Field(
        default=None,
        description="Name of the GeoAI tool that was called, if any.",
    )
    tool_result: dict[str, Any] | None = Field(
        default=None,
        description="Raw tool result for advanced frontend rendering.",
    )
    map_action: dict[str, Any] | None = Field(
        default=None,
        description="Structured map visualization payload for MapLibre GL.",
    )
    session_id: str = Field(
        ..., description="Session ID (auto-generated if not provided)."
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Data sources used in the answer (e.g. 'postgis', 'minio').",
    )


class StreamEvent(BaseModel):
    """A single SSE event during streaming."""
    event: Literal[
        "thinking",
        "tool_call",
        "tool_result",
        "answer_chunk",
        "answer_done",
        "error",
    ]
    data: str | dict[str, Any] = ""


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    error_code: str
    message: str


# --------------------------------------------------------------------------- #
# Health / meta
# --------------------------------------------------------------------------- #

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str
