"""Unified NOAA GFS 0.25° weather-map engine.

Decodes the global GFS 0.25° GRIB into scalar fields for temperature,
precipitation, cloud cover and wind. The full global GRIB file is downloaded
from NOAA NOMADS without a subregion filter, and the resulting grid dimensions
are read dynamically from the GRIB header.
"""

from __future__ import annotations

import tempfile
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlencode

import httpx
from eccodes import (  # noqa: E402
    codes_get,
    codes_get_array,
    codes_get_values,
    codes_grib_new_from_file,
    codes_release,
)
from redis.asyncio import Redis  # noqa: E402

from app.modules.environment.cache import build_cache_key, get_with_stale_fallback
from app.modules.environment.exceptions import UpstreamUnavailableError
from app.modules.environment.schemas import (
    DataStatus,
    GfsWeatherFieldFrameResponse,
    GfsWeatherGridBounds,
    GfsWindFrameResponse,
    GfsWindGridBounds,
)

NOMADS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
_HEADERS = {"User-Agent": "Naksha GeoSphere"}
_TIMEOUT = 30.0
_SHORT_NAME_SLOTS = {
    "t": "tmp",
    "10u": "u",
    "10v": "v",
    "prate": "prate",
    "tcc": "tcdc",
}
GFS_DX = 0.25
GFS_DY = 0.25
GFS_SOURCE_NAME = "NOAA GFS"
GFS_MODEL_NAME = "GFS 0.25°"

GFS_FORECAST_HOURS = (0, 1, 2, 3, 4, 5, 6)
GFS_CYCLE_CACHE_TTL_SECONDS = 900
GFS_FRAME_TTL_SECONDS = 3600


def build_gfs_filter_url(run_date: date, cycle_hour: int, forecast_hour: int) -> str:
    """One NOMADS request carrying every weather-map variable at its
    native level for the full global GFS grid. No subregion filter: the
    entire 0.25° global grid is downloaded and the frontend handles
    viewport clipping."""
    file_name = f"gfs.t{cycle_hour:02d}z.pgrb2.0p25.f{forecast_hour:03d}"
    directory = f"/gfs.{run_date:%Y%m%d}/{cycle_hour:02d}/atmos"
    query = urlencode(
        {
            "file": file_name,
            "lev_10_m_above_ground": "on",
            "var_UGRD": "on",
            "var_VGRD": "on",
            "lev_2_m_above_ground": "on",
            "var_TMP": "on",
            "lev_surface": "on",
            "var_PRATE": "on",
            "lev_entire_atmosphere": "on",
            "var_TCDC": "on",
            "dir": directory,
        }
    )
    return f"{NOMADS_FILTER_URL}?{query}"


def cycle_candidates(now_utc: datetime) -> list[tuple[date, int]]:
    current_date = now_utc.date()
    previous_date = current_date - timedelta(days=1)
    cycles = [18, 12, 6, 0]
    return [(current_date, cycle) for cycle in cycles] + [
        (previous_date, cycle) for cycle in cycles
    ]


async def _fetch_subset_bytes(run_date: date, cycle_hour: int, forecast_hour: int) -> bytes:
    url = build_gfs_filter_url(run_date, cycle_hour, forecast_hour)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            response = await client.get(url)
            response.raise_for_status()
            body = response.content
    except httpx.HTTPError as exc:
        raise UpstreamUnavailableError("NOAA NOMADS GFS") from exc

    if not body.startswith(b"GRIB"):
        raise UpstreamUnavailableError("NOAA NOMADS GFS")
    return body


def _to_utc_from_gfs(raw_date: int, raw_time: int) -> datetime:
    year = raw_date // 10000
    month = (raw_date // 100) % 100
    day = raw_date % 100
    hour = raw_time // 100
    minute = raw_time % 100
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def _normalize_grid_values(
    values: list[float],
    width: int,
    height: int,
    *,
    i_scans_negatively: bool,
    j_scans_positively: bool,
) -> list[float]:
    rows = [values[row * width : (row + 1) * width] for row in range(height)]
    if i_scans_negatively:
        rows = [list(reversed(row)) for row in rows]
    if not j_scans_positively:
        rows = list(reversed(rows))
    return [value for row in rows for value in row]


def decode_combined_grid(grib_bytes: bytes) -> dict[str, Any]:
    """Decode the combined subset into one normalized {slot: values} dict plus
    shared grid metadata. `values` are reoriented to a south→north,
    west→east row-major layout so the frontend can index them directly."""
    slots: dict[str, dict[str, Any]] = {}

    with tempfile.NamedTemporaryFile(suffix=".grib2", delete=False) as tmp:
        tmp.write(grib_bytes)
        tmp.flush()
        temp_path = tmp.name

    try:
        with open(temp_path, "rb") as handle:
            while True:
                gid = codes_grib_new_from_file(handle)
                if gid is None:
                    break

                try:
                    short_name = str(codes_get(gid, "shortName"))
                    slot = _SHORT_NAME_SLOTS.get(short_name)
                    if slot is None:
                        continue

                    width = int(codes_get(gid, "Ni"))
                    height = int(codes_get(gid, "Nj"))
                    values = [float(v) for v in codes_get_values(gid)]
                    slots[slot] = {
                        "data_date": int(codes_get(gid, "dataDate")),
                        "data_time": int(codes_get(gid, "dataTime")),
                        "validity_date": int(codes_get(gid, "validityDate")),
                        "validity_time": int(codes_get(gid, "validityTime")),
                        "forecast_hour": int(codes_get(gid, "forecastTime")),
                        "width": width,
                        "height": height,
                        "latitudes": sorted(
                            float(v) for v in codes_get_array(gid, "distinctLatitudes")
                        ),
                        "longitudes": sorted(
                            float(v) for v in codes_get_array(gid, "distinctLongitudes")
                        ),
                        "values": _normalize_grid_values(
                            values,
                            width,
                            height,
                            i_scans_negatively=bool(int(codes_get(gid, "iScansNegatively"))),
                            j_scans_positively=bool(int(codes_get(gid, "jScansPositively"))),
                        ),
                    }
                finally:
                    codes_release(gid)
    finally:
        try:
            import os

            os.remove(temp_path)
        except OSError:
            pass

    missing = {slot for slot in ("u", "v", "tmp", "prate", "tcdc") if slot not in slots}
    if missing:
        raise UpstreamUnavailableError(f"NOAA NOMADS GFS missing fields: {sorted(missing)}")

    u_meta = slots["u"]
    v_meta = slots["v"]
    if u_meta["width"] != v_meta["width"] or u_meta["height"] != v_meta["height"]:
        raise UpstreamUnavailableError("NOAA NOMADS GFS")

    return {
        "run_time": _to_utc_from_gfs(u_meta["data_date"], u_meta["data_time"]).isoformat(),
        "forecast_time": _to_utc_from_gfs(
            u_meta["validity_date"], u_meta["validity_time"]
        ).isoformat(),
        "forecast_hour": u_meta["forecast_hour"],
        "bounds": {"west": -180.0, "south": -90.0, "east": 180.0, "north": 90.0},
        "width": u_meta["width"],
        "height": u_meta["height"],
        "dx": GFS_DX,
        "dy": GFS_DY,
        "latitudes": u_meta["latitudes"],
        "longitudes": u_meta["longitudes"],
        "u": slots["u"]["values"],
        "v": slots["v"]["values"],
        "tmp": slots["tmp"]["values"],
        "prate": slots["prate"]["values"],
        "tcdc": slots["tcdc"]["values"],
    }


async def get_latest_complete_cycle(redis: Redis) -> tuple[date, int, DataStatus, datetime]:
    async def fetch() -> dict[str, Any]:
        now_utc = datetime.now(timezone.utc)
        # Probe a modest forecast hour (f003) rather than the latest (f006): a
        # freshly published cycle may not have its longest lead times posted yet,
        # and we don't want to reject an otherwise-good cycle (or every candidate)
        # during that brief window. Individual frames (including f006) still fail
        # gracefully per-request if a specific lead time isn't available.
        probe_hour = min(3, max(GFS_FORECAST_HOURS))
        for run_date, cycle_hour in cycle_candidates(now_utc):
            try:
                await _fetch_subset_bytes(run_date, cycle_hour, probe_hour)
            except UpstreamUnavailableError:
                continue
            return {"run_date": run_date.isoformat(), "cycle_hour": cycle_hour}
        raise UpstreamUnavailableError("NOAA NOMADS GFS")

    data, data_status, fetched_at = await get_with_stale_fallback(
        redis,
        key=build_cache_key("gfs-weather", "latest-cycle"),
        ttl_seconds=GFS_CYCLE_CACHE_TTL_SECONDS,
        fetch=fetch,
    )
    return date.fromisoformat(data["run_date"]), int(data["cycle_hour"]), data_status, fetched_at


async def _get_combined_grid(redis: Redis, forecast_hour: int) -> dict[str, Any]:
    if forecast_hour not in GFS_FORECAST_HOURS:
        raise ValueError(
            f"Forecast hour {forecast_hour} is outside the supported range {GFS_FORECAST_HOURS}."
        )

    run_date, cycle_hour, _, _ = await get_latest_complete_cycle(redis)
    cache_key = build_cache_key(
        "gfs-weather",
        run_date.strftime("%Y%m%d"),
        f"{cycle_hour:02d}",
        f"f{forecast_hour:03d}",
    )

    async def fetch() -> dict[str, Any]:
        grib_bytes = await _fetch_subset_bytes(run_date, cycle_hour, forecast_hour)
        return decode_combined_grid(grib_bytes)

    data, data_status, fetched_at = await get_with_stale_fallback(
        redis, key=cache_key, ttl_seconds=GFS_FRAME_TTL_SECONDS, fetch=fetch
    )
    return {
        **data,
        "data_status": data_status,
        "fetched_at": fetched_at,
    }


async def get_gfs_wind_frame(redis: Redis, forecast_hour: int) -> GfsWindFrameResponse:
    grid = await _get_combined_grid(redis, forecast_hour)
    return GfsWindFrameResponse.model_validate(
        {
            "source": GFS_SOURCE_NAME,
            "model": GFS_MODEL_NAME,
            "run_time": grid["run_time"],
            "forecast_time": grid["forecast_time"],
            "forecast_hour": grid["forecast_hour"],
            "bounds": GfsWindGridBounds(**grid["bounds"]),
            "width": grid["width"],
            "height": grid["height"],
            "dx": grid["dx"],
            "dy": grid["dy"],
            "latitudes": grid["latitudes"],
            "longitudes": grid["longitudes"],
            "u": grid["u"],
            "v": grid["v"],
            "data_status": grid["data_status"],
            "fetched_at": grid["fetched_at"],
        }
    )


async def get_gfs_field_frame(
    redis: Redis, forecast_hour: int, variable: Literal["temperature", "precipitation", "clouds"]
) -> GfsWeatherFieldFrameResponse:
    grid = await _get_combined_grid(redis, forecast_hour)

    if variable == "temperature":
        values = [kelvin - 273.15 for kelvin in grid["tmp"]]
        unit = "°C"
    elif variable == "precipitation":
        # PRATE is kg m-2 s-1; 1 kg m-2 == 1 mm, so ×3600 yields mm/h.
        values = [max(0.0, rate * 3600.0) for rate in grid["prate"]]
        unit = "mm/h"
    else:  # clouds
        values = grid["tcdc"]
        unit = "%"

    return GfsWeatherFieldFrameResponse.model_validate(
        {
            "source": GFS_SOURCE_NAME,
            "model": GFS_MODEL_NAME,
            "variable": variable,
            "run_time": grid["run_time"],
            "forecast_time": grid["forecast_time"],
            "forecast_hour": grid["forecast_hour"],
            "bounds": GfsWeatherGridBounds(**grid["bounds"]),
            "width": grid["width"],
            "height": grid["height"],
            "dx": grid["dx"],
            "dy": grid["dy"],
            "latitudes": grid["latitudes"],
            "longitudes": grid["longitudes"],
            "unit": unit,
            "values": values,
            "data_status": grid["data_status"],
            "fetched_at": grid["fetched_at"],
        }
    )
