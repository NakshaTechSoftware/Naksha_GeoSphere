"""Queues an export (single-feature or hierarchical bulk) onto the worker's
`vector` queue.

The API only *produces* these tasks; `services/worker` owns the actual
GDAL/OGR conversion (`worker.tasks.export`). Unlike the fire-and-forget
email task, the caller needs the converted file back, so the router
awaits the task's result instead of just sending it.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from celery import Celery
from celery.result import AsyncResult

from app.core.config import get_settings
from app.modules.export.schemas import ExportLayer

FEATURE_TASK_NAME = "export.export_feature"
BULK_TASK_NAME = "export.export_bulk"


@lru_cache
def _celery_producer() -> Celery:
    settings = get_settings()
    return Celery(
        "naksha_geosphere_api_producer",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
    )


def submit_export_feature(
    *,
    geometry: dict[str, Any],
    properties: dict[str, Any],
    export_format: str,
    name_hint: str,
) -> AsyncResult:
    return _celery_producer().send_task(
        FEATURE_TASK_NAME,
        args=[geometry, properties, export_format, name_hint],
        queue="vector",
    )


def submit_export_bulk(
    *,
    layers: list[ExportLayer],
    export_format: str,
    name_hint: str,
) -> AsyncResult:
    return _celery_producer().send_task(
        BULK_TASK_NAME,
        args=[[layer.model_dump() for layer in layers], export_format, name_hint],
        queue="vector",
    )
