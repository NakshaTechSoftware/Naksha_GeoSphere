"""Converts boundary features right-clicked/selected on the Explore map into
a downloadable GIS file - either one feature, or a hierarchical bulk export
(a clicked admin level plus every level selected below it). Runs on the
`vector` queue.

The converted file is uploaded to the remote object-storage temporary bucket
(`geosphere-temporary-data`) and only the object key travels back through the
Celery result backend - large exports never sit in Redis as base64 blobs.
The API streams the file from object storage and deletes it after download.
"""

from __future__ import annotations

import uuid
from typing import Any, TypedDict

from worker.core.storage_client import get_s3_client, temporary_bucket_name
from worker.geospatial.export import (
    BulkLayer,
    ExportedFile,
    ExportFormat,
    export_bulk,
    export_feature,
)
from worker.main import app


class ExportResult(TypedDict):
    key: str
    filename: str
    mimetype: str


def _store_result(exported: ExportedFile) -> ExportResult:
    key = f"exports/{uuid.uuid4().hex}/{exported['filename']}"
    get_s3_client().put_object(
        Bucket=temporary_bucket_name(),
        Key=key,
        Body=exported["content"],
        ContentType=exported["mimetype"],
    )
    return ExportResult(
        key=key,
        filename=exported["filename"],
        mimetype=exported["mimetype"],
    )


@app.task(name="export.export_feature")
def export_feature_task(
    geometry: dict[str, Any],
    properties: dict[str, Any],
    export_format: ExportFormat,
    name_hint: str,
) -> ExportResult:
    return _store_result(
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
    return _store_result(export_bulk(layers=layers, export_format=export_format, name_hint=name_hint))
