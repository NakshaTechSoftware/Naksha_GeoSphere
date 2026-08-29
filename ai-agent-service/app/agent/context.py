"""Spatial Context Resolver.

Converts raw map state from the frontend into structured context
the LLM can reason about. This is the bridge between MapLibre GL
and the LLM's spatial understanding.
"""

from __future__ import annotations

import math
from typing import Any


def resolve_map_context(map_context: dict[str, Any] | None) -> dict[str, Any]:
    """Convert raw frontend map context into AI-usable spatial context.

    Args:
        map_context: Raw map state from the frontend containing
            center, zoom, bounds, active_layers, selected_feature.

    Returns:
        Structured context dict with location_context, spatial_context,
        available_layers, selected_feature, and viewport_geometry.
    """
    if not map_context:
        return {
            "has_map_context": False,
            "location_context": "No map context available.",
            "spatial_context": "",
            "available_layers": [],
            "selected_feature": None,
            "viewport_geometry": None,
        }

    center = map_context.get("center", {})
    zoom = map_context.get("zoom", 0)
    bounds = map_context.get("bounds", {})
    active_layers = map_context.get("active_layers", [])
    selected_feature = map_context.get("selected_feature")

    lat = center.get("lat", 0)
    lon = center.get("lon", 0)

    # Build location description
    location_context = _build_location_context(lat, lon, zoom)

    # Build spatial extent description
    spatial_context = _build_spatial_context(bounds, zoom)

    # Build viewport GeoJSON polygon
    viewport_geometry = _build_viewport_geometry(bounds, lat, lon, zoom)

    # Build selected feature context
    selected_ctx = None
    if selected_feature:
        selected_ctx = _build_selected_feature_context(selected_feature)

    return {
        "has_map_context": True,
        "location_context": location_context,
        "spatial_context": spatial_context,
        "available_layers": active_layers,
        "selected_feature": selected_ctx,
        "viewport_geometry": viewport_geometry,
        "center": {"lat": lat, "lon": lon},
        "zoom": zoom,
    }


def _build_location_context(lat: float, lon: float, zoom: int) -> str:
    """Describe what the user is looking at."""
    if lat == 0 and lon == 0:
        return "User has not shared their map location."

    # Approximate area description based on zoom
    if zoom >= 16:
        area = "street-level area"
    elif zoom >= 13:
        area = "neighborhood"
    elif zoom >= 10:
        area = "city area"
    elif zoom >= 7:
        area = "district/region"
    else:
        area = "large region"

    return (
        f"User is viewing a {area} centered at "
        f"lat={lat:.4f}, lon={lon:.4f} (zoom level {zoom})."
    )


def _build_spatial_context(bounds: dict[str, Any], zoom: int) -> str:
    """Describe the visible spatial extent."""
    if not bounds:
        return ""

    north = bounds.get("north", 0)
    south = bounds.get("south", 0)
    east = bounds.get("east", 0)
    west = bounds.get("west", 0)

    if north == 0 and south == 0:
        return ""

    # Calculate approximate dimensions in km
    lat_diff = abs(north - south)
    lon_diff = abs(east - west)
    avg_lat = (north + south) / 2

    # Rough km per degree
    lat_km = lat_diff * 111.0
    lon_km = lon_diff * 111.0 * math.cos(math.radians(avg_lat))

    return (
        f"Visible area spans approximately {lat_km:.1f} km × {lon_km:.1f} km "
        f"(from {south:.4f},{west:.4f} to {north:.4f},{east:.4f})."
    )


def _build_viewport_geometry(
    bounds: dict[str, Any], lat: float, lon: float, zoom: int
) -> dict[str, Any] | None:
    """Convert bounds into a GeoJSON Polygon."""
    if not bounds:
        # Generate approximate bounds from center + zoom
        km_per_degree_lat = 111.0
        km_per_degree_lon = 111.0 * math.cos(math.radians(lat))
        # Approximate visible km based on zoom
        approx_km = 50.0 / (2 ** max(0, zoom - 8))
        half_lat = approx_km / km_per_degree_lat / 2
        half_lon = approx_km / km_per_degree_lon / 2

        south = lat - half_lat
        north = lat + half_lat
        west = lon - half_lon
        east = lon + half_lon
    else:
        south = bounds.get("south", lat - 0.05)
        north = bounds.get("north", lat + 0.05)
        west = bounds.get("west", lon - 0.05)
        east = bounds.get("east", lon + 0.05)

    return {
        "type": "Polygon",
        "coordinates": [[
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
        ]],
    }


def _build_selected_feature_context(feature: dict[str, Any]) -> dict[str, Any]:
    """Extract useful context from a selected map feature."""
    layer = feature.get("layer", "unknown")
    feature_id = feature.get("id")
    properties = feature.get("properties", {})

    # Build a human-readable description
    desc_parts = [f"User has selected a feature on the '{layer}' layer."]
    if feature_id:
        desc_parts.append(f"Feature ID: {feature_id}.")
    if properties:
        key_props = {k: v for k, v in properties.items() if v is not None}
        if key_props:
            desc_parts.append(f"Properties: {key_props}.")

    return {
        "layer": layer,
        "id": feature_id,
        "properties": properties,
        "description": " ".join(desc_parts),
    }


def format_context_for_prompt(context: dict[str, Any]) -> str:
    """Format resolved context into a string for injection into the system prompt."""
    if not context.get("has_map_context"):
        return ""

    parts = [
        "\n\n## Current Map Context",
        context.get("location_context", ""),
    ]

    spatial = context.get("spatial_context", "")
    if spatial:
        parts.append(spatial)

    layers = context.get("available_layers", [])
    if layers:
        parts.append(f"Active map layers: {', '.join(layers)}.")

    selected = context.get("selected_feature")
    if selected:
        parts.append(selected.get("description", ""))

    parts.append(
        "Use this map context to answer the user's question. "
        "When the user says 'here', 'this location', or 'this area', "
        "use the map center coordinates. When referring to a selected feature, "
        "use its ID and properties."
    )

    return "\n".join(parts)
