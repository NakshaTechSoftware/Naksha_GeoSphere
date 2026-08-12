"""S3-compatible object storage client for the worker.

Mirrors `services/api/app/services/storage_client.py` so both processes talk
to the same remote object storage (MinIO locally, managed S3 in production).
The worker uses it to hand finished export files back to the API: the file
bytes are uploaded to the temporary bucket and only the object key travels
through the Celery result backend, instead of base64-encoded megabytes.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config as BotoConfig

from worker.core.config import WorkerSettings, get_worker_settings

if TYPE_CHECKING:
    # boto3-stubs is a dev-only dependency — never imported at runtime.
    from mypy_boto3_s3.client import S3Client


@lru_cache
def get_s3_client() -> S3Client:
    settings: WorkerSettings = get_worker_settings()
    scheme = "https" if settings.minio_use_ssl else "http"

    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=settings.s3_region,
        config=BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 2},
            s3={"addressing_style": "path" if settings.s3_force_path_style else "virtual"},
        ),
    )


def temporary_bucket_name() -> str:
    return get_worker_settings().s3_bucket_temporary_data
