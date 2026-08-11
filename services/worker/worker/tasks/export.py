"""Converts boundary features right-clicked/selected on the Explore map into
a downloadable GIS file - either one feature, or a hierarchical bulk export
(a clicked admin level plus every level selected below it). Runs on the
`vector` queue."""

from __future__ import annotations

import base64
from typing import Any, TypedDict

from worker.geospatial.export import (
    BulkLayer,
    ExportedFile,
    ExportFormat,
    export_bulk,
    export_feature,
)
from worker.main import app


class ExportResult(TypedDict):
    filename: str
    mimetype: str
    content_base64: str


def _to_result(exported: ExportedFile) -> ExportResult:
    return ExportResult(
        filename=exported["filename"],
        mimetype=exported["mimetype"],
        # Celery's JSON result serializer can't carry raw bytes - base64 round-trips safely.
        content_base64=base64.b64encode(exported["content"]).decode("ascii"),
    )


@app.task(name="export.export_feature")
def export_feature_task(
    geometry: dict[str, Any],
    properties: dict[str, Any],
    export_format: ExportFormat,
    name_hint: str,
) -> ExportResult:
    return _to_result(
        export_feature(
            geometry=geometry,
            properties=properties,
            export_format=export_format,
            name_hint=name_hint,
        )
    )


@app.task(name="export.export_bulk")
def export_bulk_task(
    layers: list[BulkLayer],
    export_format: ExportFormat,
    name_hint: str,
) -> ExportResult:
    return _to_result(export_bulk(layers=layers, export_format=export_format, name_hint=name_hint))
