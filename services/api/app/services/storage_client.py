"""S3-compatible object storage client abstraction.

Backed by MinIO in local development and intended to work unmodified
against a managed S3-compatible provider in production (see
docs/DEPLOYMENT.md). Buckets themselves are created idempotently by the
`minio-init` container, not by the API.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import Settings, get_settings

if TYPE_CHECKING:
    # boto3-stubs is a dev-only dependency — never imported at runtime.
    from mypy_boto3_s3.client import S3Client

REQUIRED_BUCKETS = (
    "s3_bucket_source_data",
    "s3_bucket_preview_data",
    "s3_bucket_order_output",
    "s3_bucket_temporary_data",
)


@lru_cache
def get_s3_client() -> S3Client:
    settings: Settings = get_settings()
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


def required_bucket_names(settings: Settings) -> list[str]:
    return [getattr(settings, field) for field in REQUIRED_BUCKETS]
