"""NASA FIRMS (Fire Information for Resource Management System) client.

Fetches near-real-time active fire detections from the FIRMS Area API
(CSV endpoint) for a bounding box around a coordinate. Requires a free
MAP_KEY (`settings.nasa_firms_map_key`) — see
https://firms.modaps.eosdis.nasa.gov/api/area/.

Queries NOAA-21 and NOAA-20 VIIRS by default (the current-generation NRT
products); SNPP remains available as an optional additional source, not a
dependency. Results are cached in Redis per (satellite set, bbox bucket, day
range) so panning/zooming the Fire layer reuses recent data instead of
re-querying FIRMS on every viewport change.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from redis.asyncio import Redis

from app.core.config import Settings
from app.modules.environment.cache import build_cache_key, get_with_stale_fallback
from app.modules.environment.exceptions import UpstreamUnavailableError

FIRMS_AREA_CSV_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
_TIMEOUT = 15.0

# FIRMS Area API accepts a day_range of 1-5 days.
_MAX_DAY_RANGE = 5

# Half-width (degrees) of the bounding box probed around the requested
# coordinate — generous enough to catch nearby fires without pulling the
# whole country for a single-point lookup.
_BBOX_HALF_DEGREES = 2.0

# Nearby pans within the same ~2° bucket reuse one cached query instead of
# each firing a fresh FIRMS request - the bbox itself is snapped to this
# grid before both caching and querying, so the cache key and the actual
# upstream request always agree.
_BBOX_BUCKET_DEGREES = 2.0

# FIRMS NRT detections are refreshed by NASA roughly every 3-4 hours; a
# shorter TTL keeps the map responsive to new fires without hammering the
# upstream API on every viewport change.
_CACHE_TTL_SECONDS = 600

# Current-generation VIIRS NRT products, queried in this priority order.
# SNPP is intentionally excluded from the default set (optional add-on only,
# never a dependency) per product direction - NOAA-21/20 are current.
DEFAULT_SATELLITES = ["VIIRS_NOAA21_NRT", "VIIRS_NOAA20_NRT"]

VALID_SATELLITES = {
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "MODIS_NRT",
}

# VIIRS NRT reports confidence as a category ("l"/"n"/"h") rather than the
# 0-100 numeric scale MODIS uses. Mapped to representative numeric values so
# the frontend has one consistent numeric field regardless of source.
_VIIRS_CONFIDENCE_SCALE = {"l": 25.0, "low": 25.0, "n": 60.0, "nominal": 60.0, "h": 95.0, "high": 95.0}


def _parse_confidence(raw: str) -> float | None:
    if not raw:
        return None
    normalized = raw.strip().lower()
    if normalized in _VIIRS_CONFIDENCE_SCALE:
        return _VIIRS_CONFIDENCE_SCALE[normalized]
    try:
        return float(raw)
    except ValueError:
        return None


def _parse_float(raw: str | None) -> float | None:
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _bucket(value: float, bucket_degrees: float) -> float:
    """Snaps a coordinate down to the nearest bucket boundary."""
    import math

    return math.floor(value / bucket_degrees) * bucket_degrees


async def _fetch_satellite_csv(
    client: httpx.AsyncClient, map_key: str, satellite: str, bbox: str, day_range: int
) -> str:
    url = f"{FIRMS_AREA_CSV_BASE}/{map_key}/{satellite}/{bbox}/{day_range}"
    try:
        response = await client.get(url)
        response.raise_for_status()
        body = response.text
    except httpx.HTTPError as exc:
        raise UpstreamUnavailableError("NASA FIRMS") from exc

    # FIRMS returns a 200 with a plain-text error body (not CSV) for a bad
    # MAP_KEY or an unsupported request, rather than a non-2xx status.
    if not body or not body.lstrip().lower().startswith("latitude"):
        raise UpstreamUnavailableError("NASA FIRMS")
    return body


def _parse_csv_rows(body: str, satellite: str) -> list[dict[str, Any]]:
    detections: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(body))
    for row in reader:
        acq_date = row.get("acq_date", "")
        acq_time = row.get("acq_time", "").zfill(4)
        try:
            acquired_at = datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            continue

        latitude = _parse_float(row.get("latitude"))
        longitude = _parse_float(row.get("longitude"))
        if latitude is None or longitude is None:
            continue

        # VIIRS rows carry brightness as bright_ti4; MODIS rows use brightness.
        brightness = _parse_float(row.get("bright_ti4")) or _parse_float(row.get("brightness"))

        detections.append(
            {
                "lat": latitude,
                "lon": longitude,
                "brightness": brightness,
                "bright_ti5": _parse_float(row.get("bright_ti5")),
                "confidence": _parse_confidence(row.get("confidence", "")),
                "frp": _parse_float(row.get("frp")),
                "scan": _parse_float(row.get("scan")),
                "track": _parse_float(row.get("track")),
                "version": row.get("version") or None,
                "acquired_at": acquired_at.isoformat(),
                "satellite": row.get("satellite") or satellite,
                "instrument": row.get("instrument") or "VIIRS",
                "day_night": "day" if row.get("daynight", "D").upper() == "D" else "night",
            }
        )
    return detections


async def get_nasa_firms_data(
    redis: Redis,
    lat: float,
    lon: float,
    hours: int,
    settings: Settings,
    satellites: list[str] | None = None,
) -> list[dict]:
    """Fetch active fire detections within `hours` of now, in a bounding box
    around (lat, lon), merged across `satellites` (NOAA-21 + NOAA-20 by
    default) and deduplicated on exact (satellite, location, time) matches."""
    map_key = settings.nasa_firms_map_key
    if not map_key:
        raise UpstreamUnavailableError("NASA FIRMS (no MAP_KEY configured)")

    requested = [s for s in (satellites or DEFAULT_SATELLITES) if s in VALID_SATELLITES]
    if not requested:
        requested = DEFAULT_SATELLITES

    day_range = max(1, min(_MAX_DAY_RANGE, -(-hours // 24)))  # ceil(hours / 24)

    # Snap the query bbox to a coarse grid so nearby pans/zooms within the
    # same bucket reuse one cached result instead of each firing a fresh
    # FIRMS request.
    center_lon = _bucket(lon, _BBOX_BUCKET_DEGREES) + _BBOX_BUCKET_DEGREES / 2
    center_lat = _bucket(lat, _BBOX_BUCKET_DEGREES) + _BBOX_BUCKET_DEGREES / 2
    bbox = (
        f"{center_lon - _BBOX_HALF_DEGREES},{center_lat - _BBOX_HALF_DEGREES},"
        f"{center_lon + _BBOX_HALF_DEGREES},{center_lat + _BBOX_HALF_DEGREES}"
    )

    cache_key = build_cache_key(
        "fire", ",".join(sorted(requested)), bbox, str(day_range)
    )

    async def fetch() -> dict[str, Any]:
        all_detections: list[dict[str, Any]] = []
        seen: set[tuple[str, float, float, str]] = set()
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            for satellite in requested:
                body = await _fetch_satellite_csv(client, map_key, satellite, bbox, day_range)
                for detection in _parse_csv_rows(body, satellite):
                    dedupe_key = (
                        str(detection["satellite"]),
                        round(detection["lat"], 4),
                        round(detection["lon"], 4),
                        str(detection["acquired_at"]),
                    )
                    if dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)
                    all_detections.append(detection)
        return {"detections": all_detections}

    cached, _, _ = await get_with_stale_fallback(
        redis, key=cache_key, ttl_seconds=_CACHE_TTL_SECONDS, fetch=fetch
    )

    # The cache holds the full `day_range`-day window (day granularity, so it
    # can be reused across the UI's 24h/48h/72h options); re-filter to the
    # caller's actual `hours` window on every read.
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return [d for d in cached["detections"] if datetime.fromisoformat(d["acquired_at"]) >= cutoff]


async def check_nasa_firms_availability(settings: Settings) -> bool:
    """Lightweight health check: a configured MAP_KEY is the only thing this
    backend controls — actual upstream reachability is checked per-request."""
    return bool(settings.nasa_firms_map_key)
