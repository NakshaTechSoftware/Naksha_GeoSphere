"""Pure, Celery-independent GeoJSON geometry validation.

Operates only on in-memory geometry mappings supplied directly in the
task payload — this module never accepts or opens a filesystem path, by
design, since it is reachable from an async task queue and must not be
usable to read arbitrary files.
"""

from __future__ import annotations

from typing import Any, TypedDict

from shapely.errors import ShapelyError
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry


class GeometryValidationResult(TypedDict):
    valid: bool
    geometry_type: str | None
    reason: str | None


def validate_geojson_geometry(geometry: dict[str, Any]) -> GeometryValidationResult:
    if not isinstance(geometry, dict) or "type" not in geometry:
        return GeometryValidationResult(
            valid=False, geometry_type=None, reason="not a GeoJSON geometry object"
        )

    try:
        parsed: BaseGeometry = shape(geometry)
    except (ShapelyError, ValueError, TypeError) as exc:
        return GeometryValidationResult(
            valid=False, geometry_type=geometry.get("type"), reason=str(exc)
        )

    if not parsed.is_valid:
        return GeometryValidationResult(
            valid=False,
            geometry_type=parsed.geom_type,
            reason="geometry topology is invalid (self-intersection or similar)",
        )

    if parsed.is_empty:
        return GeometryValidationResult(
            valid=False, geometry_type=parsed.geom_type, reason="geometry is empty"
        )

    return GeometryValidationResult(valid=True, geometry_type=parsed.geom_type, reason=None)
