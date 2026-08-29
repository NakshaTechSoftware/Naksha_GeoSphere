"""Extended map action models.

Defines all visualization payloads the AI agent can return
for MapLibre GL to render on the frontend map.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class MarkerAction(BaseModel):
    """Place one or more markers on the map."""
    type: Literal["marker"] = "marker"
    coordinates: list[float] = Field(
        ..., min_length=2, max_length=2,
        description="[longitude, latitude]",
    )
    label: str | None = None
    popup: str | None = None


class RouteAction(BaseModel):
    """Draw a route polyline on the map."""
    type: Literal["route"] = "route"
    coordinates: list[list[float]] = Field(
        default_factory=list,
        description="Ordered [lon, lat] pairs forming the route polyline.",
    )
    distance_meters: float | None = None
    duration_seconds: float | None = None


class PolygonAction(BaseModel):
    """Highlight a polygon area on the map."""
    type: Literal["polygon"] = "polygon"
    geometry: dict[str, Any] = Field(
        default_factory=dict,
        description="GeoJSON Polygon geometry.",
    )
    label: str | None = None


class HighlightAction(BaseModel):
    """Highlight a specific polygon/area on the map with styling."""
    type: Literal["highlight"] = "highlight"
    geometry: dict[str, Any] = Field(
        default_factory=dict,
        description="GeoJSON geometry to highlight.",
    )
    label: str | None = None
    color: str = Field(default="#3b82f6", description="Highlight color hex.")
    fill_opacity: float = Field(default=0.3, ge=0, le=1)


class AddLayerAction(BaseModel):
    """Add a new data layer to the map."""
    type: Literal["add_layer"] = "add_layer"
    layer_name: str = Field(..., description="Name for the new layer.")
    geometry: dict[str, Any] = Field(
        default_factory=dict,
        description="GeoJSON FeatureCollection or Feature to add.",
    )
    color: str | None = None


class FlyToAction(BaseModel):
    """Animate the map camera to a location."""
    type: Literal["fly_to"] = "fly_to"
    center: list[float] = Field(
        ..., min_length=2, max_length=2,
        description="[longitude, latitude]",
    )
    zoom: float = Field(default=14, ge=0, le=22)
    pitch: float | None = None
    bearing: float | None = None


class MultiMarkerAction(BaseModel):
    """Place multiple markers on the map (e.g., nearby results)."""
    type: Literal["multi_marker"] = "multi_marker"
    markers: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of {coordinates: [lon,lat], label: str} objects.",
    )


# Union of all map action types
MapAction = (
    MarkerAction
    | RouteAction
    | PolygonAction
    | HighlightAction
    | AddLayerAction
    | FlyToAction
    | MultiMarkerAction
)


def parse_map_action(data: dict[str, Any]) -> MapAction | None:
    """Parse a raw dict into the correct MapAction type."""
    if not data or "type" not in data:
        return None

    action_type = data.get("type")
    parsers = {
        "marker": MarkerAction,
        "route": RouteAction,
        "polygon": PolygonAction,
        "highlight": HighlightAction,
        "add_layer": AddLayerAction,
        "fly_to": FlyToAction,
        "multi_marker": MultiMarkerAction,
    }

    cls = parsers.get(action_type)
    if cls is None:
        return None

    try:
        return cls(**data)
    except Exception:
        return None
