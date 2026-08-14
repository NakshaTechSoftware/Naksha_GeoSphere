"""Converts boundary features right-clicked/selected on the Explore map into
a downloadable GIS file - either one feature, or a hierarchical bulk export
(a clicked admin level plus every level selected below it). Runs on the
`vector` queue.

The converted file is uploaded to the remote object-storage temporary bucket
(`geosphere-temporary-data`) and only the object key travels back through the
Celery result backend - large exports never sit in Redis as base64 blobs.
The API streams the file from object storage and deletes it after download.

A bulk export's *input* features go through the same bucket, the other
direction: a whole-district export can be hundreds of MB of GeoJSON, far
past what the frontend's Node process (V8 has a hard ~512MB per-string cap)
or a single Celery/Redis message can safely carry inline. The API stages the
frontend-collected features there as newline-delimited JSON and hands this
task only the staging key; this task streams them back out itself.
"""

from __future__ import annotations

import json
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


def _load_staged_layers(staged_key: str) -> list[BulkLayer]:
    """Downloads and parses the NDJSON the API staged for this task, one
    `{"level": ..., "feature": {"geometry": ..., "properties": ...}}` record per
    line, grouping features back into per-level layers. Deletes the staged
    object once read - it's a one-shot handoff, not meant to linger."""
    obj = get_s3_client().get_object(Bucket=temporary_bucket_name(), Key=staged_key)
    body = obj["Body"].read()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in body.splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        grouped.setdefault(record["level"], []).append(record["feature"])

    try:
        get_s3_client().delete_object(Bucket=temporary_bucket_name(), Key=staged_key)
    except Exception:  # noqa: BLE001 — best-effort cleanup; leftovers are transient.
        pass

    return [BulkLayer(level=level, features=features) for level, features in grouped.items()]


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
    staged_key: str,
    export_format: ExportFormat,
    name_hint: str,
) -> ExportResult:
    layers = _load_staged_layers(staged_key)
    return _store_result(export_bulk(layers=layers, export_format=export_format, name_hint=name_hint))
