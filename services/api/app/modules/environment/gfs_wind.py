"""NOAA GFS 0.25° 10 m wind for the all-India domain.

Wind now shares the unified all-India GFS engine in `gfs_weather` (the old
Karnataka-only "canary" subset has been retired). `build_gfs_filter_url`
is kept (and points at the India subregion) so the existing unit test for
the NOMADS subset pattern still holds; `get_gfs_wind_frame` delegates to the
combined-grid decoder so wind, temperature, rain and clouds all come from one
downloaded GRIB.
"""

from __future__ import annotations

from datetime import date
from urllib.parse import urlencode

from redis.asyncio import Redis

from app.modules.environment import gfs_weather
from app.modules.environment.gfs_weather import (  # noqa: F401
    _normalize_grid_values,
    cycle_candidates,
)
from app.modules.environment.schemas import GfsWindFrameResponse, GfsWindGridBounds

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
GFS_MODEL_NAME = "GFS 0.25°"
GFS_SOURCE_NAME = "NOAA GFS"
GFS_REGION_NAME = "india"
GFS_FORECAST_HOURS = (0, 1, 2, 3, 4, 5, 6)
GFS_BOUNDS = GfsWindGridBounds(west=65.0, south=5.0, east=100.0, north=39.0)
GFS_DX = 0.25
GFS_DY = 0.25
GFS_CYCLE_CACHE_TTL_SECONDS = 900
GFS_FRAME_TTL_SECONDS = 3600


def build_gfs_filter_url(run_date: date, cycle_hour: int, forecast_hour: int) -> str:
    file_name = f"gfs.t{cycle_hour:02d}z.pgrb2.0p25.f{forecast_hour:03d}"
    directory = f"/gfs.{run_date:%Y%m%d}/{cycle_hour:02d}/atmos"
    query = urlencode(
        {
            "file": file_name,
            "lev_10_m_above_ground": "on",
            "var_UGRD": "on",
            "var_VGRD": "on",
            "subregion": "",
            "leftlon": GFS_BOUNDS.west,
            "rightlon": GFS_BOUNDS.east,
            "toplat": GFS_BOUNDS.north,
            "bottomlat": GFS_BOUNDS.south,
            "dir": directory,
        }
    )
    return f"{NOMADS_FILTER_URL}?{query}"


async def get_gfs_wind_frame(redis: Redis, forecast_hour: int) -> GfsWindFrameResponse:
    """All-India 10 m U/V wind frame, served from the unified combined GFS
    grid so it shares one download/cache with temperature/rain/clouds."""
    if forecast_hour not in GFS_FORECAST_HOURS:
        raise ValueError(
            f"Forecast hour {forecast_hour} is outside the supported range {GFS_FORECAST_HOURS}."
        )
    return await gfs_weather.get_gfs_wind_frame(redis, forecast_hour)
