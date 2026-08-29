"""Internal MinIO access — never reachable by the AI agent.

Credentials live only in settings (sourced from environment variables) and
are never included in any response, log line, or tool schema. This is the
fallback data source for nearby_service.py / spatial_service.py when a
layer has no PostGIS table yet.
"""

from __future__ import annotations

import json
import time
from functools import lru_cache

import boto3
from botocore.client import Config as BotoConfig

from app.config.settings import get_settings
from app.core.exceptions import UpstreamError

# Some statewide boundary layers (e.g. the Karnataka police-jurisdiction
# file) are tens of MB. They change rarely, so a request-scoped in-process
# cache avoids re-downloading and re-parsing the whole file on every
# nearby/spatial-query call — this is a fallback path (PostGIS is always
# tried first), but it still needs to not be the slow path.
_geojson_cache: dict[str, tuple[float, dict]] = {}
_GEOJSON_CACHE_TTL_SECONDS = 3600


@lru_cache
def _client():
    settings = get_settings()
    scheme = "https" if settings.minio_use_ssl else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


def get_geojson(object_key: str) -> dict:
    """Fetch and parse a GeoJSON object from the configured source bucket.

    Raises UpstreamError on any failure — callers treat this exactly like
    any other unavailable data source and fall through/report accordingly.
    """
    settings = get_settings()
    try:
        obj = _client().get_object(Bucket=settings.minio_source_bucket, Key=object_key)
        body = obj["Body"].read()
        return json.loads(body)
    except Exception as exc:  # noqa: BLE001 - normalized below
        raise UpstreamError(f"Failed to read '{object_key}' from object storage.") from exc


def get_geojson_cached(object_key: str, ttl_seconds: int = _GEOJSON_CACHE_TTL_SECONDS) -> dict:
    """Like get_geojson(), but reuses an in-process copy for `ttl_seconds`."""
    now = time.time()
    cached = _geojson_cache.get(object_key)
    if cached is not None and (now - cached[0]) < ttl_seconds:
        return cached[1]
    data = get_geojson(object_key)
    _geojson_cache[object_key] = (now, data)
    return data


_folder_cache: dict[str, tuple[float, list[str]]] = {}


def list_folder_names(prefix: str) -> list[str]:
    """Return the immediate subfolder names directly under `prefix`.

    Used to resolve per-district files (e.g. pincode boundaries) whose
    folder names are the "ground truth" — a district-boundary shapefile's
    own name property doesn't always spell it the same way, see
    spatial_service.py's postal_code resolver.
    """
    settings = get_settings()
    try:
        resp = _client().list_objects_v2(
            Bucket=settings.minio_source_bucket, Prefix=prefix, Delimiter="/"
        )
    except Exception as exc:  # noqa: BLE001 - normalized below
        raise UpstreamError(f"Failed to list '{prefix}' in object storage.") from exc
    names = []
    for common_prefix in resp.get("CommonPrefixes", []):
        trimmed = common_prefix["Prefix"][len(prefix) :].rstrip("/")
        if trimmed:
            names.append(trimmed)
    return names


def list_folder_names_cached(prefix: str, ttl_seconds: int = _GEOJSON_CACHE_TTL_SECONDS) -> list[str]:
    """Like list_folder_names(), but reuses an in-process copy for `ttl_seconds`."""
    now = time.time()
    cached = _folder_cache.get(prefix)
    if cached is not None and (now - cached[0]) < ttl_seconds:
        return cached[1]
    names = list_folder_names(prefix)
    _folder_cache[prefix] = (now, names)
    return names
