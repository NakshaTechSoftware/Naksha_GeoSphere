"""API endpoints for converting map features into downloadable GIS files
(GeoJSON/Shapefile/KML/KMZ/GPKG/GDB/CSV) - a single right-clicked feature, or
a hierarchical bulk export (a clicked admin level plus everything selected
below it).

The worker uploads the finished file to the remote object-storage temporary
bucket and returns only an object key; this module streams the file from
object storage back to the caller and deletes it once served."""

from __future__ import annotations

import asyncio
import logging

from celery.exceptions import TimeoutError as CeleryTimeoutError
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, Response, status

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


async def _await_export(async_result: AsyncResult, *, timeout: int) -> Response:
    try:
        result = await asyncio.to_thread(async_result.get, timeout=timeout, propagate=True)
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

    # The worker parked the finished file in the remote temporary bucket;
    # stream it from there, then remove it (exports are one-shot downloads
    # and the bucket is only meant to hold transient objects).
    bucket = get_settings().s3_bucket_temporary_data
    key = result["key"]
    try:
        fetched = await asyncio.to_thread(
            get_s3_client().get_object, Bucket=bucket, Key=key
        )
        content = await asyncio.to_thread(fetched["Body"].read)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Export object %s not retrievable from %s", key, bucket)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export file could not be retrieved",
        ) from exc

    try:
        await asyncio.to_thread(get_s3_client().delete_object, Bucket=bucket, Key=key)
    except Exception:  # noqa: BLE001 — best-effort cleanup; leftovers are transient.
        logger.warning("Failed to delete export object %s from %s", key, bucket)

    return Response(
        content=content,
        media_type=result["mimetype"],
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@router.post("/feature")
async def export_feature(payload: ExportFeatureRequest) -> Response:
    """Converts the given feature and returns the file as the response body."""
    async_result = submit_export_feature(
        geometry=payload.geometry,
        properties=payload.properties,
        export_format=payload.export_format,
        name_hint=payload.name_hint,
    )
    return await _await_export(async_result, timeout=EXPORT_FEATURE_TIMEOUT_SECONDS)


@router.post("/bulk")
async def export_bulk(payload: ExportBulkRequest) -> Response:
    """Converts several admin-hierarchy levels (already collected by the caller) into
    one download and returns it as the response body."""
    async_result = submit_export_bulk(
        layers=payload.layers,
        export_format=payload.export_format,
        name_hint=payload.name_hint,
    )
    return await _await_export(async_result, timeout=EXPORT_BULK_TIMEOUT_SECONDS)
