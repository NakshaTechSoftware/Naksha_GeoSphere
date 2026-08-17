"""NASA FIRMS fire detection endpoints.

Provides access to NASA FIRMS (Fire Information for Resource Management System)
real-time active fire observations. Routed entirely through the backend so
the MAP_KEY never reaches the frontend (same pattern as the CPCB AQI key).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.config import Settings, get_settings
from app.modules.environment import nasa_firms
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/environment/fire", tags=["fire"])


@router.get("/", response_model=list[dict])
async def get_fires(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(24, ge=1, le=120, description="Hours back from now (1-120)"),
    satellites: str = Query(
        ",".join(nasa_firms.DEFAULT_SATELLITES),
        description="Comma-separated NASA FIRMS satellites (defaults to NOAA-21 + NOAA-20 NRT)",
    ),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get fire detections from NASA FIRMS for a location and time window,
    merged across the requested satellites and deduplicated.

    Returns fire observations from NASA FIRMS VIIRS sensors.
    Each observation includes location, brightness, confidence, etc.
    """
    requested = [s.strip() for s in satellites.split(",") if s.strip()]
    return await nasa_firms.get_nasa_firms_data(
        get_redis_client(), lat, lon, hours, settings, requested
    )


@router.get("/satellite-options")
async def list_nasa_firms_satellites() -> dict:
    """List available NASA FIRMS satellite options."""
    return {
        "satellites": [
            {
                "id": "VIIRS_NOAA21_NRT",
                "name": "NOAA-21 VIIRS NRT",
                "resolution": "375m",
                "latency": "~3 hours",
            },
            {
                "id": "VIIRS_NOAA20_NRT",
                "name": "NOAA-20 VIIRS NRT",
                "resolution": "375m",
                "latency": "~3 hours",
            },
            {
                "id": "VIIRS_SNPP_NRT",
                "name": "Suomi NPP VIIRS NRT",
                "resolution": "375m",
                "latency": "~3 hours",
            },
        ],
        "default": nasa_firms.DEFAULT_SATELLITES,
    }


@router.get("/health")
async def nasa_firms_health(settings: Settings = Depends(get_settings)) -> dict:
    """Check if the NASA FIRMS integration is configured/available."""
    is_available = await nasa_firms.check_nasa_firms_availability(settings)
    return {
        "status": "healthy" if is_available else "unavailable",
        "service": "NASA FIRMS",
        "message": "NASA FIRMS fire detection service"
        + (" available" if is_available else " unavailable (no MAP_KEY configured)"),
    }
