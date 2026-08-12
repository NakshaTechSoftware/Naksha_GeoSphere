"""API endpoints for converting map features into downloadable GIS files
(GeoJSON/Shapefile/KML/KMZ/GPKG/GDB/CSV) - a single right-clicked feature, or
a hierarchical bulk export (a clicked admin level plus everything selected
below it).

The worker uploads the finished file to the remote object-storage temporary
bucket and returns only an object key; this module streams the file from
object storage back to the caller and deletes it once served.

A bulk export's *input* can itself be hundreds of MB (a whole district's
worth of GeoJSON), so it takes the same route in reverse: the frontend
stages its collected features here as NDJSON (POST /bulk/stage) instead of
embedding them in the /bulk request body, and downloads the finished file via
GET /download/{key} instead of getting it back inline - the file content
never needs to pass through the frontend's Node process as a single string,
which has a hard ~512MB per-string limit that a whole-district export
comfortably exceeds."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from celery.exceptions import TimeoutError as CeleryTimeoutError
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.modules.export.schemas import ExportBulkRequest, ExportFeatureRequest
from app.modules.export.tasks import submit_export_bulk, submit_export_feature
from app.services.storage_client import get_s3_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

# One feature's worth of GDAL/OGR conversion completes in well under a second;
# this bounds how long the request can be held open waiting on the worker.
EXPORT_FEATURE_TIMEOUT_SECONDS = 25

# A bulk export can walk hundreds of villages across a whole district (or more, for a
# whole-state export) - held just under the worker's own 300s hard task_time_limit so a
# genuine worker-side timeout surfaces as a clear task failure rather than this request
# timing out first with no explanation.
EXPORT_BULK_TIMEOUT_SECONDS = 280

# Staged bulk-export input and finished export output live in the same temporary
# bucket, distinguished by prefix - staging/... is a one-shot handoff into a Celery
# task, exports/... is a one-shot download out of one. /download/{key} only ever
# serves the latter.
STAGED_KEY_PREFIX = "staging/"
EXPORT_KEY_PREFIX = "exports/"


async def _await_export_result(async_result: AsyncResult, *, timeout: int) -> dict[str, Any]:
    try:
        return await asyncio.to_thread(async_result.get, timeout=timeout, propagate=True)
    except CeleryTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Export timed out",
        ) from exc
    except Exception as exc:  # noqa: BLE001 — the worker task raised (bad geometry,
        # unsupported format, or a GDAL/OGR write failure); surface it as a 400 rather
        # than an opaque 500 since it's almost always caused by the request payload.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export failed: {exc}",
        ) from exc


async def _fetch_and_delete(key: str) -> tuple[bytes, str]:
    """Fetches an object from the temporary bucket and removes it - exports are
    one-shot downloads and the bucket is only meant to hold transient objects."""
    bucket = get_settings().s3_bucket_temporary_data
    try:
        fetched = await asyncio.to_thread(get_s3_client().get_object, Bucket=bucket, Key=key)
        content = await asyncio.to_thread(fetched["Body"].read)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Export object %s not retrievable from %s", key, bucket)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export file could not be retrieved",
        ) from exc

    mimetype = fetched.get("ContentType") or "application/octet-stream"
    try:
        await asyncio.to_thread(get_s3_client().delete_object, Bucket=bucket, Key=key)
    except Exception:  # noqa: BLE001 — best-effort cleanup; leftovers are transient.
        logger.warning("Failed to delete export object %s from %s", key, bucket)

    return content, mimetype


@router.post("/feature")
async def export_feature(payload: ExportFeatureRequest) -> Response:
    """Converts the given feature and returns the file as the response body. Always a
    single feature, so unlike /bulk it's small enough to return inline."""
    async_result = submit_export_feature(
        geometry=payload.geometry,
        properties=payload.properties,
        export_format=payload.export_format,
        name_hint=payload.name_hint,
    )
    result = await _await_export_result(async_result, timeout=EXPORT_FEATURE_TIMEOUT_SECONDS)
    content, _ = await _fetch_and_delete(result["key"])
    return Response(
        content=content,
        media_type=result["mimetype"],
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@router.post("/bulk/stage")
async def stage_bulk_layers(request: Request) -> dict[str, str]:
    """Stores the frontend's NDJSON-encoded feature stream (one `{"level":
    ..., "feature": {...}}` record per line) in the temporary bucket ahead of
    a /bulk call, so the actual feature data never has to be embedded in a
    JSON request body - see module docstring."""
    body = await request.body()
    key = f"{STAGED_KEY_PREFIX}{uuid.uuid4().hex}.ndjson"
    bucket = get_settings().s3_bucket_temporary_data
    await asyncio.to_thread(
        get_s3_client().put_object,
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/x-ndjson",
    )
    return {"staged_key": key}


@router.post("/bulk")
async def export_bulk(payload: ExportBulkRequest) -> dict[str, str]:
    """Converts several admin-hierarchy levels (staged ahead of time via
    /bulk/stage) into one file and returns only its location in the temporary
    bucket - never the file content itself. The caller downloads it via
    GET /download/{key}."""
    async_result = submit_export_bulk(
        staged_key=payload.staged_key,
        export_format=payload.export_format,
        name_hint=payload.name_hint,
    )
    result = await _await_export_result(async_result, timeout=EXPORT_BULK_TIMEOUT_SECONDS)
    return {"key": result["key"], "filename": result["filename"], "mimetype": result["mimetype"]}


@router.get("/download/{key:path}")
async def download_export(key: str) -> Response:
    """Streams a finished export out of the temporary bucket and deletes it. Only
    ever serves keys /bulk (or /feature) itself produced - never an arbitrary
    caller-supplied path into the bucket."""
    if not key.startswith(EXPORT_KEY_PREFIX):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    content, mimetype = await _fetch_and_delete(key)
    filename = key.rsplit("/", 1)[-1]
    return Response(
        content=content,
        media_type=mimetype,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
