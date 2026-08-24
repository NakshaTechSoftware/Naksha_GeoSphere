"""Environmental Aggregation Service.

Combines the three provider clients (Open-Meteo weather, Open-Meteo air
quality, CPCB) behind cached, coordinate-validated, per-section functions.
Every aggregated response wraps each provider's data in a `{status, data}`
section (see `schemas.py`) so one provider failing never prevents the
others from being returned — the router never lets an
`UpstreamUnavailableError` from one section abort the whole request.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

from app.core.config import Settings
from app.modules.environment import cpcb_client, open_meteo_client
from app.modules.environment.cache import build_cache_key, get_with_stale_fallback, round_coordinate
from app.modules.environment.exceptions import (
    CpcbApiKeyMissingError,
    InvalidCoordinatesError,
    UpstreamUnavailableError,
)
from app.modules.environment.schemas import (
    AirQualityResponse,
    AqiGridResponse,
    AqiGridPoint,
    CpcbStation,
    CurrentEnvironmentResponse,
    DataStatus,
    DailyForecastDay,
    DailyForecastResponse,
    GfsWeatherGridBounds,
    HourlyForecastPoint,
    HourlyForecastResponse,
    ModeledAirQuality,
    ModeledAqiSection,
    NearestStation,
    OfficialAqiSection,
    SectionStatus,
    WeatherObservation,
    WeatherResponse,
    WeatherSection,
)

WEATHER_TTL_SECONDS = 600  # 10 minutes
DAILY_FORECAST_TTL_SECONDS = 1800  # 30 minutes
HOURLY_FORECAST_TTL_SECONDS = 600  # 10 minutes
AIR_QUALITY_TTL_SECONDS = 900  # 15 minutes
CPCB_TTL_SECONDS = 900  # 15 minutes
AQI_GRID_TTL_SECONDS = 1800  # 30 minutes

_EARTH_RADIUS_KM = 6371.0


def validate_coordinates(latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90):
        raise InvalidCoordinatesError(f"Latitude {latitude} is out of range (-90 to 90).")
    if not (-180 <= longitude <= 180):
        raise InvalidCoordinatesError(f"Longitude {longitude} is out of range (-180 to 180).")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def find_nearest_station(
    stations: list[CpcbStation], latitude: float, longitude: float
) -> NearestStation | None:
    if not stations:
        return None
    nearest = min(
        stations, key=lambda s: haversine_km(latitude, longitude, s.latitude, s.longitude)
    )
    distance = haversine_km(latitude, longitude, nearest.latitude, nearest.longitude)
    return NearestStation(station=nearest, distance_km=round(distance, 2))


async def get_weather_section(redis: Redis, latitude: float, longitude: float) -> WeatherSection:
    lat_r, lon_r = round_coordinate(latitude), round_coordinate(longitude)
    key = build_cache_key("weather", str(lat_r), str(lon_r))

    async def fetch() -> dict[str, Any]:
        raw = await open_meteo_client.fetch_weather_raw(latitude, longitude)
        return open_meteo_client.parse_weather(raw, latitude, longitude).model_dump(mode="json")

    try:
        data, data_status, fetched_at = await get_with_stale_fallback(
            redis, key=key, ttl_seconds=WEATHER_TTL_SECONDS, fetch=fetch
        )
    except UpstreamUnavailableError:
        return WeatherSection(
            status=SectionStatus.UNAVAILABLE,
            message="Live weather is temporarily unavailable.",
        )

    return WeatherSection(
        status=SectionStatus.AVAILABLE,
        data=WeatherObservation.model_validate(data),
        data_status=data_status,
        fetched_at=fetched_at,
    )


async def get_modeled_air_quality_section(
    redis: Redis, latitude: float, longitude: float
) -> ModeledAqiSection:
    lat_r, lon_r = round_coordinate(latitude), round_coordinate(longitude)
    key = build_cache_key("air-quality", str(lat_r), str(lon_r))

    async def fetch() -> dict[str, Any]:
        raw = await open_meteo_client.fetch_air_quality_raw(latitude, longitude)
        return open_meteo_client.parse_air_quality(raw, latitude, longitude).model_dump(mode="json")

    try:
        data, data_status, fetched_at = await get_with_stale_fallback(
            redis, key=key, ttl_seconds=AIR_QUALITY_TTL_SECONDS, fetch=fetch
        )
    except UpstreamUnavailableError:
        return ModeledAqiSection(
            status=SectionStatus.UNAVAILABLE,
            message="Modeled air-quality information is temporarily unavailable.",
        )

    return ModeledAqiSection(
        status=SectionStatus.AVAILABLE,
        data=ModeledAirQuality.model_validate(data),
        data_status=data_status,
        fetched_at=fetched_at,
    )


async def get_weather(redis: Redis, latitude: float, longitude: float) -> WeatherResponse:
    """Standalone `GET /environment/weather` — unlike the aggregated
    endpoints, a total failure here raises `UpstreamUnavailableError`
    directly (translated to a clean 503 by the module's error handler)
    rather than being wrapped in a section, since there's only one
    provider involved."""
    validate_coordinates(latitude, longitude)
    section = await get_weather_section(redis, latitude, longitude)
    if section.status != SectionStatus.AVAILABLE or section.data is None:
        raise UpstreamUnavailableError("Open-Meteo Weather")
    return WeatherResponse(
        **section.data.model_dump(),
        data_status=section.data_status or "LIVE",
        fetched_at=section.fetched_at,  # type: ignore[arg-type]
    )


async def get_air_quality(redis: Redis, latitude: float, longitude: float) -> AirQualityResponse:
    validate_coordinates(latitude, longitude)
    section = await get_modeled_air_quality_section(redis, latitude, longitude)
    if section.status != SectionStatus.AVAILABLE or section.data is None:
        raise UpstreamUnavailableError("Open-Meteo Air Quality")
    return AirQualityResponse(
        **section.data.model_dump(),
        data_status=section.data_status or "LIVE",
        fetched_at=section.fetched_at,  # type: ignore[arg-type]
    )


async def get_daily_forecast(
    redis: Redis, latitude: float, longitude: float
) -> DailyForecastResponse:
    validate_coordinates(latitude, longitude)
    lat_r, lon_r = round_coordinate(latitude), round_coordinate(longitude)
    key = build_cache_key("daily-forecast", str(lat_r), str(lon_r))

    async def fetch() -> dict[str, Any]:
        raw = await open_meteo_client.fetch_daily_forecast_raw(latitude, longitude)
        days = open_meteo_client.parse_daily_forecast(raw)
        return {"days": [day.model_dump(mode="json") for day in days]}

    data, data_status, fetched_at = await get_with_stale_fallback(
        redis, key=key, ttl_seconds=DAILY_FORECAST_TTL_SECONDS, fetch=fetch
    )

    return DailyForecastResponse(
        latitude=latitude,
        longitude=longitude,
        days=[DailyForecastDay.model_validate(day) for day in data["days"]],
        data_status=data_status,
        fetched_at=fetched_at,
    )


async def get_hourly_forecast(
    redis: Redis, latitude: float, longitude: float
) -> HourlyForecastResponse:
    validate_coordinates(latitude, longitude)
    lat_r, lon_r = round_coordinate(latitude), round_coordinate(longitude)
    key = build_cache_key("hourly-forecast", str(lat_r), str(lon_r))

    async def fetch() -> dict[str, Any]:
        raw = await open_meteo_client.fetch_hourly_forecast_raw(latitude, longitude)
        points = open_meteo_client.parse_hourly_forecast(raw)
        return {"points": [p.model_dump(mode="json") for p in points]}

    data, data_status, fetched_at = await get_with_stale_fallback(
        redis, key=key, ttl_seconds=HOURLY_FORECAST_TTL_SECONDS, fetch=fetch
    )
    points = [HourlyForecastPoint.model_validate(p) for p in data["points"]]

    return HourlyForecastResponse(
        latitude=latitude,
        longitude=longitude,
        points=points,
        data_status=data_status,
        fetched_at=fetched_at,
    )


async def get_current_environment(
    redis: Redis, settings: Settings, latitude: float, longitude: float
) -> CurrentEnvironmentResponse:
    validate_coordinates(latitude, longitude)
    weather = await get_weather_section(redis, latitude, longitude)
    official_air_quality = await get_official_aqi_section(
        redis, settings, latitude, longitude
    )
    modeled_air_quality = await get_modeled_air_quality_section(redis, latitude, longitude)
    return CurrentEnvironmentResponse(
        latitude=latitude,
        longitude=longitude,
        weather=weather,
        official_air_quality=official_air_quality,
        modeled_air_quality=modeled_air_quality,
    )


async def get_karnataka_stations(
    redis: Redis, settings: Settings
) -> tuple[list[CpcbStation], DataStatus, datetime]:
    """Returns (stations, data_status, fetched_at). Raises
    `CpcbApiKeyMissingError` if no key is configured (a config problem,
    distinct from a transient provider outage) and `UpstreamUnavailableError`
    if the feed is down with no cached fallback available."""
    return await get_cpcb_stations(redis, settings, state="Karnataka")


async def get_cpcb_stations(
    redis: Redis, settings: Settings, state: str | None = None
) -> tuple[list[CpcbStation], DataStatus, datetime]:
    """All India (state=None) or state-scoped official CPCB monitoring
    stations, cached server-side. One normalized station per physical
    location. Returns (stations, data_status, fetched_at)."""
    state_key = (state or "india").lower()
    key = build_cache_key("cpcb", state_key, "stations")

    async def fetch() -> dict[str, Any]:
        if state and state.lower() != "india":
            records = await cpcb_client.fetch_raw_records(settings.data_gov_in_api_key, state=state)
            stations = cpcb_client.group_into_stations(records)
        else:
            stations = await cpcb_client.fetch_all_stations(settings)
        return {"stations": [s.model_dump(mode="json") for s in stations]}

    data, data_status, fetched_at = await get_with_stale_fallback(
        redis, key=key, ttl_seconds=CPCB_TTL_SECONDS, fetch=fetch
    )
    stations = [CpcbStation.model_validate(s) for s in data["stations"]]
    return stations, data_status, fetched_at


async def get_official_aqi_section(
    redis: Redis, settings: Settings, latitude: float, longitude: float
) -> OfficialAqiSection:
    try:
        # National station list so any Indian coordinate resolves to its
        # true nearest official CPCB monitoring station.
        stations, data_status, fetched_at = await get_cpcb_stations(redis, settings, None)
    except CpcbApiKeyMissingError as exc:
        return OfficialAqiSection(status=SectionStatus.UNAVAILABLE, message=exc.message)
    except UpstreamUnavailableError:
        return OfficialAqiSection(
            status=SectionStatus.UNAVAILABLE,
            message="Official AQI station data is temporarily unavailable.",
        )

    nearest = find_nearest_station(stations, latitude, longitude)
    if nearest is None:
        return OfficialAqiSection(
            status=SectionStatus.UNAVAILABLE,
            message="No official CPCB stations are currently available for this area.",
        )

    return OfficialAqiSection(
        status=SectionStatus.AVAILABLE,
        data=nearest.station,
        distance_km=nearest.distance_km,
        data_status=data_status,
        fetched_at=fetched_at,
    )


async def get_aqi_grid(
    redis: Redis,
) -> AqiGridResponse:
    """Modeled Open-Meteo air-quality surface over the all-India domain, cached
    server-side. Each grid point is an independent modeled estimate. The
    returned points are ordered row-major (south→north, west→east) with
    `width`/`height` describing the grid dimensions so the frontend can
    reconstruct pixel coordinates without parsing lat/lon per point."""
    key = build_cache_key("aqi", "india", "grid")

    def fetch() -> dict[str, Any]:
        points, lats, lons = open_meteo_client.build_aqi_grid_coords()
        latitudes = [p[0] for p in points]
        longitudes = [p[1] for p in points]
        return {"latitudes": latitudes, "longitudes": longitudes}

    async def fetch_async() -> dict[str, Any]:
        points, lats, lons = open_meteo_client.build_aqi_grid_coords()
        results = await open_meteo_client.fetch_aqi_grid_raw(lats, lons)

        # Map results back to points by index (Open-Meteo preserves order).
        grid_points: list[AqiGridPoint] = []
        for idx, result in enumerate(results):
            if idx >= len(points):
                break
            latitude, longitude = points[idx]
            current = result.get("current") or {}
            grid_points.append(
                AqiGridPoint(
                    latitude=latitude,
                    longitude=longitude,
                    pm2_5=current.get("pm2_5"),
                    us_aqi=current.get("us_aqi"),
                    data_status="LIVE",
                    fetched_at=datetime.now(timezone.utc),
                )
            )

        return {
            "points": [gp.model_dump(mode="json") for gp in grid_points],
            "width": len(lons),
            "height": len(lats),
        }

    try:
        data, data_status, fetched_at = await get_with_stale_fallback(
            redis, key=key, ttl_seconds=AQI_GRID_TTL_SECONDS, fetch=fetch_async
        )
    except UpstreamUnavailableError:
        return AqiGridResponse(
            bounds=GfsWeatherGridBounds(west=65.0, south=5.0, east=100.0, north=39.0),
            width=0,
            height=0,
            points=[],
            data_status="STALE",
             fetched_at=datetime.now(timezone.utc),
        )

    points_out = [AqiGridPoint.model_validate(p) for p in data["points"]]
    # Refresh fetched_at to the cache timestamp for every point.
    for p in points_out:
        p.fetched_at = fetched_at  # type: ignore[assignment]
        p.data_status = data_status  # type: ignore[assignment]

    return AqiGridResponse(
        bounds=bounds,
        width=data["width"],
        height=data["height"],
        points=points_out,
        data_status=data_status,
        fetched_at=fetched_at,
    )
