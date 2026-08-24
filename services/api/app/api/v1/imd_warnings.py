"""IMD district nowcast warning endpoints.

Proxies IMD's own public GeoServer WFS (reactjs.imd.gov.in) so the browser
never talks to it directly - matches the pattern used for FIRMS/CPCB (see
fire.py): third-party credentials/endpoints stay server-side, and a
transient upstream outage is absorbed by the Redis cache instead of
reaching every client.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.modules.environment import imd_warnings
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/environment/imd/warnings", tags=["imd-warnings"])


@router.get("/")
async def get_imd_warnings() -> dict:
    """Current IMD district nowcast warnings for all of India, as a GeoJSON
    FeatureCollection - see imd_warnings.py for the normalized properties
    shape and the source's severity color-code mapping."""
    return await imd_warnings.get_imd_district_warnings(get_redis_client())


@router.get("/health")
async def imd_warnings_health() -> dict:
    """IMD's GeoServer is public/anonymous - always reports configured;
    actual reachability is only checked per-request."""
    is_available = await imd_warnings.check_imd_warnings_availability()
    return {
        "status": "healthy" if is_available else "unavailable",
        "service": "IMD District Nowcast Warnings",
        "message": "IMD GeoServer WFS proxy"
        + (" available" if is_available else " unavailable"),
    }
