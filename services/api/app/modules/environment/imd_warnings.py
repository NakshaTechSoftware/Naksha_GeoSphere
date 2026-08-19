"""IMD (India Meteorological Department) district nowcast warnings client.

Fetches the public `imd:NowcastWarningDistrict` layer from IMD's own
GeoServer WFS (https://reactjs.imd.gov.in/geoserver/wfs) - a publicly
accessible, anonymous, unauthenticated OGC service (verified: no API key,
no login, no IP whitelist, no session cookie required; confirmed via a
live GetCapabilities + GetFeature probe).

This is IMD's short-range (nowcast) district warning product - not a
forecast, not the same as observed rain, and not the same as the longer
5/7-day district-or-subdivision warning outlook layers also present on
this GeoServer (`district_warnings_india`, `subdiv_warnings_now`), which
were investigated but not integrated: their per-day fields are IMD
internal phenomenon codes (e.g. Day_1: "2,41,8") with no public code
legend, so a UI label built from them would have to guess - the explicit
prohibition this module is built to avoid. `NowcastWarningDistrict`, by
contrast, carries a free-text `message` field IMD populates directly for
active warnings, so nothing about the display text is inferred.

Severity: the source's `Color` field is a bare integer (1-4 observed).
IMD's colour-coded warning scale is a long-standing, publicly documented
national standard (Green = No Warning, Yellow = Watch, Orange = Alert,
Red = Warning - see e.g. https://mausam.imd.gov.in and IMD press
materials); this module maps 1-4 to that fixed, standard scale rather
than inferring anything from this dataset itself. 0 is treated as
"unknown" (rare in samples, not part of the documented 4-tier scale).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from redis.asyncio import Redis

from app.modules.environment.cache import build_cache_key, get_with_stale_fallback
from app.modules.environment.exceptions import UpstreamUnavailableError

logger = logging.getLogger(__name__)

IMD_WFS_BASE = "https://reactjs.imd.gov.in/geoserver/wfs"
IMD_WARNING_LAYER = "imd:NowcastWarningDistrict"
_TIMEOUT = 15.0

# IMD refreshes district nowcasts roughly hourly (observed `update_time`
# spread in a live sample); a 10-minute TTL keeps the map reasonably current
# without hammering IMD's GeoServer on every panel open.
_CACHE_TTL_SECONDS = 600

_SEVERITY_BY_COLOR: dict[int, str] = {1: "GREEN", 2: "YELLOW", 3: "ORANGE", 4: "RED"}

# Only the fields this integration actually uses are requested (via WFS
# `propertyName`) - cuts payload size and avoids carrying the cat1..cat19
# internal phenomenon-flag columns, which have no public legend and are
# not surfaced.
_PROPERTY_NAMES = ",".join(
    [
        "geom",
        "Fid",
        "Date",
        "District",
        "State",
        "MC_RMC",
        "message",
        "impact",
        "action",
        "toi",
        "vupto",
        "Color",
        "update_time",
    ]
)


def _parse_hhmm_today_ist(hhmm: str, reference_date: str) -> str | None:
    """IMD's `toi`/`vupto` are bare "HHMM" strings (e.g. "1600") for the
    warning's own `Date` (also IST, "YYYY-MM-DD"). Combines them into a
    real ISO 8601 IST timestamp rather than displaying the raw digits."""
    if not hhmm or len(hhmm) != 4 or not hhmm.isdigit():
        return None
    try:
        hour, minute = int(hhmm[:2]), int(hhmm[2:])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        date_part = datetime.strptime(reference_date, "%Y-%m-%d")
        return f"{date_part.date().isoformat()}T{hour:02d}:{minute:02d}:00+05:30"
    except ValueError:
        return None


def _round_coordinates(node: Any, precision: int = 5) -> Any:
    """Rounds GeoJSON coordinate arrays to `precision` decimal places (~1 m at
    this latitude range) - IMD's GeoServer emits ~8 decimal places (~1 mm),
    far finer than a district-warning polygon needs on a map. Cuts payload
    size substantially with no visible loss of detail; never touches
    anything but numeric leaf coordinates."""
    if isinstance(node, list):
        if node and isinstance(node[0], (int, float)):
            return [round(n, precision) for n in node]
        return [_round_coordinates(child, precision) for child in node]
    return node


def _normalize_feature(feature: dict[str, Any]) -> dict[str, Any] | None:
    props = feature.get("properties") or {}
    geometry = feature.get("geometry")
    if not geometry or "coordinates" not in geometry:
        return None
    geometry = {**geometry, "coordinates": _round_coordinates(geometry["coordinates"])}

    color = props.get("Color")
    severity = _SEVERITY_BY_COLOR.get(color) if isinstance(color, int) else None
    date = props.get("Date") or ""

    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": {
            "id": f"imd-nowcast-{props.get('Fid') or feature.get('id')}",
            "source": "IMD",
            "areaName": props.get("District"),
            "state": props.get("State"),
            "meteorologicalCentre": props.get("MC_RMC"),
            "severity": severity,
            # Raw 1-4 code kept alongside the mapped label - lets the
            # frontend re-derive styling without re-guessing the mapping,
            # and makes an unrecognized future code (5+) visibly distinct
            # from a mapping bug rather than silently defaulting.
            "severityCode": color,
            "category": "NOWCAST",
            "description": (props.get("message") or "").strip() or None,
            "impact": (props.get("impact") or "").strip() or None,
            "action": (props.get("action") or "").strip() or None,
            "issuedAt": _parse_hhmm_today_ist(props.get("toi", ""), date),
            "validUntil": _parse_hhmm_today_ist(props.get("vupto", ""), date),
            "updatedAt": props.get("update_time"),
        },
    }


async def get_imd_district_warnings(redis: Redis) -> dict[str, Any]:
    """Fetches every current IMD district nowcast entry (India-wide - the
    layer isn't large enough to warrant BBOX-scoping) and normalizes it to
    a GeoJSON FeatureCollection with a stable, source-agnostic properties
    shape. Cached; a GeoServer outage falls back to the last-known-good
    copy (see get_with_stale_fallback) rather than clearing the layer."""
    cache_key = build_cache_key("imd", "district-nowcast-warnings")

    async def fetch() -> dict[str, Any]:
        params = {
            "service": "WFS",
            "version": "1.1.0",
            "request": "GetFeature",
            "typeName": IMD_WARNING_LAYER,
            "srsName": "EPSG:4326",
            "outputFormat": "application/json",
            "propertyName": _PROPERTY_NAMES,
        }
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.get(IMD_WFS_BASE, params=params)
                response.raise_for_status()
                raw = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise UpstreamUnavailableError("IMD GeoServer") from exc

        raw_features = raw.get("features") if isinstance(raw, dict) else None
        if not isinstance(raw_features, list):
            raise UpstreamUnavailableError("IMD GeoServer")

        features = [f for f in (_normalize_feature(feat) for feat in raw_features) if f is not None]
        return {"type": "FeatureCollection", "features": features}

    data, _, _ = await get_with_stale_fallback(
        redis, key=cache_key, ttl_seconds=_CACHE_TTL_SECONDS, fetch=fetch
    )
    return data


async def check_imd_warnings_availability() -> bool:
    """Lightweight health check: this integration needs no configuration
    (the IMD GeoServer is public/anonymous) - always "available" from the
    server's own perspective; actual upstream reachability is checked
    per-request."""
    return True
