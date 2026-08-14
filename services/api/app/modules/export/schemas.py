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


class ExportBulkRequest(BaseModel):
    """The frontend walks the admin hierarchy (state -> district -> taluk -> hobli ->
    village) itself via its own MinIO-backed routes, but never sends the collected
    features directly here - a whole-district export can be hundreds of MB of GeoJSON,
    past what a single JSON request body can safely carry through Node's V8 engine
    (~512MB per-string hard cap) or a single Celery/Redis message. It stages them as
    NDJSON via POST /export/bulk/stage first and passes only the resulting key."""

    export_format: ExportFormat
    staged_key: str
    name_hint: str = "export"
