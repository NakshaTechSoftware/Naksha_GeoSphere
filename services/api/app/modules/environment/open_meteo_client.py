"""Async HTTP client and normalizer for the Open-Meteo weather and
air-quality APIs. Neither endpoint requires an API key.

Response shapes below were confirmed against the live APIs during
development (not assumed from documentation):

    GET https://api.open-meteo.com/v1/forecast
        ?latitude=..&longitude=..&current=temperature_2m,relative_humidity_2m,
         precipitation,rain,wind_speed_10m,wind_direction_10m,surface_pressure
         &timezone=Asia/Kolkata
    -> {"current_units": {...}, "current": {"time": "2026-08-12T12:00", ...}}

    GET https://air-quality-api.open-meteo.com/v1/air-quality
        ?latitude=..&longitude=..&current=pm10,pm2_5,carbon_monoxide,
         nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi
         &timezone=Asia/Kolkata
    -> {"current_units": {...}, "current": {"time": "2026-08-12T11:30", ...}}

`current.time` is returned as a *local* (Asia/Kolkata) timestamp with no
UTC offset suffix, since we passed `timezone=Asia/Kolkata` — so it's
parsed and tagged with the fixed +05:30 offset rather than treated as UTC.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from app.modules.environment.exceptions import UpstreamUnavailableError
from app.modules.environment.schemas import (
    DailyForecastDay,
    HourlyForecastPoint,
    ModeledAirQuality,
    WeatherObservation,
)

WEATHER_BASE_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

_WEATHER_CURRENT_VARS = (
    "temperature_2m,relative_humidity_2m,precipitation,rain,"
    "wind_speed_10m,wind_direction_10m,surface_pressure"
)
_WEATHER_DAILY_VARS = (
    "weather_code,temperature_2m_max,temperature_2m_min,"
    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max"
)
_WEATHER_HOURLY_VARS = (
    "temperature_2m,precipitation_probability,precipitation,"
    "wind_speed_10m,wind_direction_10m"
)
_AIR_QUALITY_CURRENT_VARS = (
    "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi"
)

_AQI_GRID_VARS = "pm2_5,us_aqi"

# All-India grid for the modeled AQ surface: ~1° resolution with enough points
# to render a surface without hammering the API too hard.
_AQI_GRID_LAT0 = 39.0
_AQI_GRID_LAT1 = 5.0
_AQI_GRID_LON0 = 65.0
_AQI_GRID_LON1 = 100.0
_AQI_GRID_STEP_DEG = 1.0

_TIMEOUT = httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=3.0)
_HEADERS = {"User-Agent": "NakshaGeoSphere/1.0 (+environment-module)"}
_IST = timezone(timedelta(hours=5, minutes=30))

_COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def degrees_to_compass(degrees: float | None) -> str | None:
    """Converts wind direction in degrees to an 8-point compass label."""
    if degrees is None:
        return None
    index = round((degrees % 360) / 45) % 8
    return _COMPASS_POINTS[index]


def _parse_local_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).replace(tzinfo=_IST)
    except ValueError:
        return None


async def _get_json(url: str, params: dict[str, Any], *, provider: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()  # type: ignore[no-any-return]
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamUnavailableError(provider) from exc


async def fetch_weather_raw(latitude: float, longitude: float) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": _WEATHER_CURRENT_VARS,
        "timezone": "Asia/Kolkata",
    }
    return await _get_json(WEATHER_BASE_URL, params, provider="Open-Meteo Weather")


async def fetch_air_quality_raw(latitude: float, longitude: float) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": _AIR_QUALITY_CURRENT_VARS,
        "timezone": "Asia/Kolkata",
    }
    return await _get_json(AIR_QUALITY_BASE_URL, params, provider="Open-Meteo Air Quality")


async def fetch_daily_forecast_raw(latitude: float, longitude: float) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": _WEATHER_DAILY_VARS,
        "forecast_days": 7,
        "timezone": "Asia/Kolkata",
    }
    return await _get_json(WEATHER_BASE_URL, params, provider="Open-Meteo Daily Forecast")


async def fetch_hourly_forecast_raw(latitude: float, longitude: float) -> dict[str, Any]:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": _WEATHER_HOURLY_VARS,
        "forecast_days": 2,
        "timezone": "Asia/Kolkata",
    }
    return await _get_json(WEATHER_BASE_URL, params, provider="Open-Meteo Hourly Forecast")


def _value_at(values: Any, index: int) -> Any:
    if isinstance(values, list) and index < len(values):
        return values[index]
    return None


def parse_weather(raw: dict[str, Any], latitude: float, longitude: float) -> WeatherObservation:
    current = raw.get("current") or {}
    wind_direction = current.get("wind_direction_10m")
    return WeatherObservation(
        latitude=latitude,
        longitude=longitude,
        temperature_c=current.get("temperature_2m"),
        relative_humidity_percent=current.get("relative_humidity_2m"),
        precipitation_mm=current.get("precipitation"),
        rain_mm=current.get("rain"),
        wind_speed_kmh=current.get("wind_speed_10m"),
        wind_direction_degrees=wind_direction,
        wind_direction_compass=degrees_to_compass(wind_direction),
        surface_pressure_hpa=current.get("surface_pressure"),
        observation_time=_parse_local_time(current.get("time")),
    )


def parse_daily_forecast(raw: dict[str, Any]) -> list[DailyForecastDay]:
    daily = raw.get("daily") or {}
    raw_dates = daily.get("time") or []
    days: list[DailyForecastDay] = []

    for index, raw_date in enumerate(raw_dates):
        try:
            parsed_date = date.fromisoformat(raw_date)
        except (TypeError, ValueError):
            continue

        days.append(
            DailyForecastDay(
                date=parsed_date,
                weather_code=_value_at(daily.get("weather_code"), index),
                temperature_max_c=_value_at(daily.get("temperature_2m_max"), index),
                temperature_min_c=_value_at(daily.get("temperature_2m_min"), index),
                precipitation_sum_mm=_value_at(daily.get("precipitation_sum"), index),
                precipitation_probability_max=_value_at(
                    daily.get("precipitation_probability_max"), index
                ),
                wind_speed_max_kmh=_value_at(daily.get("wind_speed_10m_max"), index),
            )
        )

    return days


def parse_hourly_forecast(raw: dict[str, Any]) -> list[HourlyForecastPoint]:
    """Next-24-hour hourly series (local Asia/Kolkata time). We request two
    forecast days and keep the first 24 hours on/after the current hour so
    the chart always starts "now" rather than at local midnight."""
    hourly = raw.get("hourly") or {}
    raw_times = hourly.get("time") or []
    now = datetime.now(_IST)
    points: list[HourlyForecastPoint] = []

    for index, raw_time in enumerate(raw_times):
        parsed = _parse_local_time(raw_time)
        if parsed is None:
            continue
        if parsed < now:
            continue
        points.append(
            HourlyForecastPoint(
                time=parsed,
                temperature_c=_value_at(hourly.get("temperature_2m"), index),
                precipitation_probability_percent=_value_at(
                    hourly.get("precipitation_probability"), index
                ),
                precipitation_mm=_value_at(hourly.get("precipitation"), index),
                wind_speed_kmh=_value_at(hourly.get("wind_speed_10m"), index),
                wind_direction_degrees=_value_at(hourly.get("wind_direction_10m"), index),
                wind_direction_compass=degrees_to_compass(
                    _value_at(hourly.get("wind_direction_10m"), index)
                ),
            )
        )
        if len(points) >= 24:
            break

    return points


def parse_air_quality(
    raw: dict[str, Any], latitude: float, longitude: float
) -> ModeledAirQuality:
    current = raw.get("current") or {}
    return ModeledAirQuality(
        latitude=latitude,
        longitude=longitude,
        pm10=current.get("pm10"),
        pm2_5=current.get("pm2_5"),
        co=current.get("carbon_monoxide"),
        no2=current.get("nitrogen_dioxide"),
        so2=current.get("sulphur_dioxide"),
        o3=current.get("ozone"),
        us_aqi=current.get("us_aqi"),
        european_aqi=current.get("european_aqi"),
        observation_time=_parse_local_time(current.get("time")),
    )


# --- Modeled AQ surface (gridded) --------------------------------------------


def build_aqi_grid_coords(
    lat0: float = _AQI_GRID_LAT0,
    lat1: float = _AQI_GRID_LAT1,
    lon0: float = _AQI_GRID_LON0,
    lon1: float = _AQI_GRID_LON1,
    step: float = _AQI_GRID_STEP_DEG,
) -> tuple[list[tuple[float, float]], list[float], list[float]]:
    """Builds a ~1° lat/lon grid covering the all-India domain. Points are
    ordered south→north then west→east so the row-major surface can be
    reconstructed by the caller. Returns (points, latitudes, longitudes)
    where `points` interleaves lat×lon in the same order."""
    lats: list[float] = []
    lat = lat1
    while lat <= lat0 + 1e-9:
        lats.append(round(lat, 4))
        lat += step
    lons: list[float] = []
    lon = lon0
    while lon <= lon1 + 1e-9:
        lons.append(round(lon, 4))
        lon += step

    points: list[tuple[float, float]] = []
    for latitude in lats:
        for longitude in lons:
            points.append((latitude, longitude))
    return points, lats, lons


async def fetch_aqi_grid_raw(
    latitudes: list[float], longitudes: list[float]
) -> list[dict[str, Any]]:
    """Fetches modeled air quality at many points in a single batched request.

    Open-Meteo accepts comma-separated arrays for latitude/longitude (up to 50
    locations per request), returning a `results` array with one entry per
    coordinate pair, each carrying a `current` object with the requested vars.

    Returns a flat list of result dicts, each shaped as:
        {"latitude": float, "longitude": float, "current": {...}}
    """
    results: list[dict[str, Any]] = []
    batch_size = 50
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        for start in range(0, len(latitudes), batch_size):
            batch_lats = latitudes[start : start + batch_size]
            batch_lons = longitudes[start : start + batch_size]
            params = {
                "latitude": ",".join(str(v) for v in batch_lats),
                "longitude": ",".join(str(v) for v in batch_lons),
                "current": _AQI_GRID_VARS,
                "timezone": "Asia/Kolkata",
            }
            try:
                response = await client.get(AIR_QUALITY_BASE_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise UpstreamUnavailableError("Open-Meteo Air Quality Grid") from exc
            batch_results = payload.get("results") or []
            results.extend(batch_results)
    return results
