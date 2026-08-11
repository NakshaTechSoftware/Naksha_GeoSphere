"""Celery application entrypoint.

Run with:
    celery -A worker.main worker --loglevel=info -Q default,raster,vector,lidar,notifications
"""

from __future__ import annotations

from celery import Celery
from celery.signals import setup_logging as celery_setup_logging
from kombu import Queue

from worker.core.config import get_worker_settings
from worker.core.logging import configure_logging

settings = get_worker_settings()

app = Celery(
    "naksha_geosphere_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "worker.tasks.system",
        "worker.tasks.geospatial",
        "worker.tasks.notifications",
        "worker.tasks.export",
    ],
)

# --- Queues -----------------------------------------------------------
# Every queue the future clipping/conversion pipelines will need is
# declared up front so routing decisions don't require a broker restart
# later. Only `default` has tasks registered against it today.
app.conf.task_queues = (
    Queue("default"),
    Queue("raster"),
    Queue("vector"),
    Queue("lidar"),
    Queue("notifications"),
)
app.conf.task_default_queue = "default"

app.conf.task_routes = {
    "system.*": {"queue": "default"},
    "geospatial.*": {"queue": "default"},
    "notifications.*": {"queue": "notifications"},
    "export.*": {"queue": "vector"},
}

# --- Reliability --------------------------------------------------------
app.conf.task_acks_late = True
app.conf.worker_prefetch_multiplier = 1
app.conf.task_reject_on_worker_lost = True
app.conf.broker_connection_retry_on_startup = True
app.conf.task_soft_time_limit = settings.task_soft_time_limit_seconds
app.conf.task_time_limit = settings.task_time_limit_seconds
app.conf.result_expires = 3600
app.conf.worker_send_task_events = True
app.conf.task_send_sent_event = True


# Celery normally hijacks the root logger with its own formatter; wiring
# this signal lets us keep structured JSON logs consistent with the API.
@celery_setup_logging.connect
def _configure_worker_logging(**_kwargs: object) -> None:
    configure_logging(settings.log_level)


if __name__ == "__main__":
    app.start()
