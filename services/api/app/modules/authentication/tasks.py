"""Queues the verification email onto the worker's `notifications` queue.

The API only *produces* this task; `services/worker` owns the actual
implementation (`worker.tasks.notifications.send_verification_email`).
Never log `verification_url` — it contains the raw, single-use token.
"""

from __future__ import annotations

from functools import lru_cache

from celery import Celery

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TASK_NAME = "notifications.send_verification_email"


@lru_cache
def _celery_producer() -> Celery:
    settings = get_settings()
    return Celery(
        "naksha_geosphere_api_producer",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
    )


def queue_verification_email(*, to_email: str, full_name: str, verification_url: str) -> None:
    try:
        _celery_producer().send_task(
            TASK_NAME,
            kwargs={
                "to_email": to_email,
                "full_name": full_name,
                "verification_url": verification_url,
            },
            queue="notifications",
        )
    except Exception:  # noqa: BLE001 — email delivery must never break registration
        logger.error("Failed to queue verification email")
