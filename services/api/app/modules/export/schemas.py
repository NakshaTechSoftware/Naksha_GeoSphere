"""Request schemas for converting map features into downloadable GIS files
(Explore page's right-click attribute panel "Export" action, both the
single-feature and hierarchical bulk-export flavors)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ExportFormat = Literal["geojson", "shapefile", "kml", "kmz", "gpkg", "gdb", "csv"]
AdminLevel = Literal["state", "district", "taluk", "hobli", "village", "survey_plot"]


class ExportFeatureRequest(BaseModel):
    export_format: ExportFormat
    geometry: dict[str, Any]
    properties: dict[str, Any] = Field(default_factory=dict)
    # Used to derive the downloaded filename (e.g. the feature's name/title). Sanitized
    # worker-side before it ever touches a filesystem path.
    name_hint: str = "export"


class ExportLayer(BaseModel):
    level: AdminLevel
    # Each item is a GeoJSON-shaped {"geometry": ..., "properties": ...} pair - the frontend
    # already collected these by walking the admin hierarchy (state -> district -> taluk ->
    # hobli -> village) via its own MinIO-backed routes before calling this endpoint.
    features: list[dict[str, Any]]


class ExportBulkRequest(BaseModel):
    export_format: ExportFormat
    layers: list[ExportLayer]
    name_hint: str = "export"
