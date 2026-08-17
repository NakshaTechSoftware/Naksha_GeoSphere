"""API endpoints for live weather and air quality (spec section D).

Public, read-only reference-data endpoints — no auth dependency exists
anywhere in this codebase yet, matching `locations`/`datasets`. All
external-provider calls are routed through the backend so the CPCB API key
never reaches the frontend (spec section X).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.config import Settings, get_settings
from app.modules.environment import aggregator
from app.modules.environment import gfs_wind
from app.modules.environment import gfs_weather
from app.modules.environment import mosdac_cloud
from app.modules.environment.exceptions import StationNotFoundError, UpstreamUnavailableError
from app.modules.environment.geojson import stations_to_geojson
from app.modules.environment.schemas import (
    AirQualityResponse,
    AqiGridResponse,
    CpcbCitiesResponse,
    CpcbStation,
    CpcbStationsResponse,
    CpcbSummaryResponse,
    CurrentEnvironmentResponse,
    DailyForecastResponse,
    HourlyForecastResponse,
    GfsWeatherFieldFrameResponse,
    GfsWindFrameResponse,
    GeoJsonFeatureCollection,
    LocationSummaryResponse,
    WeatherResponse,
)
from app.services.redis_client import get_redis_client

router = APIRouter(prefix="/environment", tags=["environment"])

Latitude = Query(..., ge=-90, le=90, description="Latitude in decimal degrees (-90 to 90).")
Longitude = Query(..., ge=-180, le=180, description="Longitude in decimal degrees (-180 to 180).")


@router.get("/weather", response_model=WeatherResponse)
async def get_weather(
    latitude: float = Latitude,
    longitude: float = Longitude,
) -> WeatherResponse:
    """Current weather for an arbitrary coordinate (Open-Meteo)."""
    return await aggregator.get_weather(get_redis_client(), latitude, longitude)


@router.get("/air-quality", response_model=AirQualityResponse)
async def get_air_quality(
    latitude: float = Latitude,
    longitude: float = Longitude,
) -> AirQualityResponse:
    """Modeled/gridded air quality for an arbitrary coordinate (Open-Meteo).
    Never a substitute for an official CPCB station reading — see
    `source_type: "MODELED"` on the response."""
    return await aggregator.get_air_quality(get_redis_client(), latitude, longitude)


@router.get("/current", response_model=CurrentEnvironmentResponse)
async def get_current(
    latitude: float = Latitude,
    longitude: float = Longitude,
) -> CurrentEnvironmentResponse:
    """Aggregates Open-Meteo weather + modeled air quality for a
    coordinate. Each section reports AVAILABLE/UNAVAILABLE independently —
    one provider failing never blanks out the other's data."""
    return await aggregator.get_current_environment(get_redis_client(), latitude, longitude)


@router.get("/daily-forecast", response_model=DailyForecastResponse)
async def get_daily_forecast(
    latitude: float = Latitude,
    longitude: float = Longitude,
) -> DailyForecastResponse:
    """Five-day Open-Meteo daily forecast for an arbitrary coordinate."""
    return await aggregator.get_daily_forecast(get_redis_client(), latitude, longitude)


@router.get("/hourly-forecast", response_model=HourlyForecastResponse)
async def get_hourly_forecast(
    latitude: float = Latitude,
    longitude: float = Longitude,
) -> HourlyForecastResponse:
    """Next-24-hour Open-Meteo hourly forecast (temperature, precipitation
    probability/amount, wind) for an arbitrary coordinate."""
    return await aggregator.get_hourly_forecast(get_redis_client(), latitude, longitude)


@router.get("/wind/gfs", response_model=GfsWindFrameResponse)
async def get_gfs_wind_canary(
    forecast_hour: int = Query(
        0,
        ge=0,
        le=6,
        description="NOAA GFS all-India forecast hour (0 through 6).",
    ),
) -> GfsWindFrameResponse:
    """All-India NOAA GFS 0.25° 10 m wind vectors for one forecast hour."""
    return await gfs_wind.get_gfs_wind_frame(get_redis_client(), forecast_hour)


@router.get("/weather-map/gfs/wind", response_model=GfsWindFrameResponse)
async def get_weather_map_gfs_wind(
    forecast_hour: int = Query(0, ge=0, le=6, description="NOAA GFS forecast hour (0 through 6)."),
) -> GfsWindFrameResponse:
    """All-India NOAA GFS 0.25° 10 m wind vectors (unified weather-map pipeline)."""
    return await gfs_weather.get_gfs_wind_frame(get_redis_client(), forecast_hour)


@router.get("/weather-map/gfs/temperature", response_model=GfsWeatherFieldFrameResponse)
async def get_weather_map_gfs_temperature(
    forecast_hour: int = Query(0, ge=0, le=6, description="NOAA GFS forecast hour (0 through 6)."),
) -> GfsWeatherFieldFrameResponse:
    """All-India NOAA GFS 0.25° 2 m temperature (°C) for one forecast hour."""
    return await gfs_weather.get_gfs_field_frame(get_redis_client(), forecast_hour, "temperature")


@router.get("/weather-map/gfs/precipitation", response_model=GfsWeatherFieldFrameResponse)
async def get_weather_map_gfs_precipitation(
    forecast_hour: int = Query(0, ge=0, le=6, description="NOAA GFS forecast hour (0 through 6)."),
) -> GfsWeatherFieldFrameResponse:
    """All-India NOAA GFS 0.25° surface precipitation rate (mm/h) for one hour."""
    return await gfs_weather.get_gfs_field_frame(get_redis_client(), forecast_hour, "precipitation")


@router.get("/weather-map/gfs/clouds", response_model=GfsWeatherFieldFrameResponse)
async def get_weather_map_gfs_clouds(
    forecast_hour: int = Query(0, ge=0, le=6, description="NOAA GFS forecast hour (0 through 6)."),
) -> GfsWeatherFieldFrameResponse:
    """All-India NOAA GFS 0.25° total cloud cover (%, TCDC) for one forecast hour."""
    return await gfs_weather.get_gfs_field_frame(get_redis_client(), forecast_hour, "clouds")


@router.get("/weather-map/gfs/pressure", response_model=GfsWeatherFieldFrameResponse)
async def get_weather_map_gfs_pressure(
    forecast_hour: int = Query(0, ge=0, le=6, description="NOAA GFS forecast hour (0 through 6)."),
) -> GfsWeatherFieldFrameResponse:
    """All-India NOAA GFS 0.25° mean sea-level pressure (hPa, PRMSL) for one forecast hour."""
    return await gfs_weather.get_gfs_field_frame(get_redis_client(), forecast_hour, "pressure")


@router.get("/weather-map/mosdac/cloud")
async def get_mosdac_cloud_frame(
    day_night: Literal["day", "night"] = Query("day", description="Day or night product"),
    product_id: str | None = Query(None, description="Specific INSAT product ID (optional)"),
) -> dict:
    """
    Get the latest available INSAT geostationary cloud frame from MOSDAC WMS.

    Returns a frame with tile URL template for MapLibre raster source.
    Uses INSAT-3DS (primary) or INSAT-3D/3DR (fallback) operational products.
    """
    frame = await mosdac_cloud.get_latest_insat_cloud_frame(day_night, product_id)
    if not frame:
        raise UpstreamUnavailableError("MOSDAC INSAT")
    return frame


@router.get("/weather-map/mosdac/products")
async def list_mosdac_products() -> list[dict]:
    """List available INSAT satellite products for cloud visualization."""
    return mosdac_cloud.get_available_insat_products()


@router.get("/location-summary", response_model=LocationSummaryResponse)
async def get_location_summary(
    latitude: float = Latitude,
    longitude: float = Longitude,
    settings: Settings = Depends(get_settings),
) -> LocationSummaryResponse:
    """Consolidated weather + official CPCB (nearest station) + modeled air
    quality for a coordinate — the shape described in spec section D."""
    redis = get_redis_client()
    aggregator.validate_coordinates(latitude, longitude)

    weather = await aggregator.get_weather_section(redis, latitude, longitude)
    official_air_quality = await aggregator.get_official_aqi_section(
        redis, settings, latitude, longitude
    )
    modeled_air_quality = await aggregator.get_modeled_air_quality_section(
        redis, latitude, longitude
    )

    return LocationSummaryResponse(
        location={"latitude": latitude, "longitude": longitude},
        weather=weather,
        official_air_quality=official_air_quality,
        modeled_air_quality=modeled_air_quality,
        timestamps={
            "weather_observed_at": weather.data.observation_time if weather.data else None,
            "weather_fetched_at": weather.fetched_at,
            "official_aqi_last_update": official_air_quality.data.last_update
            if official_air_quality.data
            else None,
            "official_aqi_fetched_at": official_air_quality.fetched_at,
            "modeled_air_quality_observed_at": modeled_air_quality.data.observation_time
            if modeled_air_quality.data
            else None,
            "modeled_air_quality_fetched_at": modeled_air_quality.fetched_at,
        },
        sources={
            "weather": "Open-Meteo",
            "official_air_quality": "CPCB / data.gov.in",
            "modeled_air_quality": "Open-Meteo",
        },
    )


@router.get("/aqi/karnataka", response_model=CpcbStationsResponse)
async def get_karnataka_aqi(settings: Settings = Depends(get_settings)) -> CpcbStationsResponse:
    """All currently available official CPCB Karnataka monitoring stations."""
    stations, data_status, fetched_at = await aggregator.get_karnataka_stations(
        get_redis_client(), settings
    )
    return CpcbStationsResponse(
        count=len(stations), data_status=data_status, fetched_at=fetched_at, stations=stations
    )


@router.get("/aqi/geojson", response_model=GeoJsonFeatureCollection)
async def get_karnataka_aqi_geojson(
    settings: Settings = Depends(get_settings),
) -> GeoJsonFeatureCollection:
    """CPCB Karnataka AQI monitoring stations as a GeoJSON FeatureCollection
    — one Point feature per physical station (spec section K)."""
    stations, _, _ = await aggregator.get_karnataka_stations(get_redis_client(), settings)
    return stations_to_geojson(stations)


@router.get("/aqi/stations", response_model=CpcbStationsResponse)
async def list_aqi_stations(settings: Settings = Depends(get_settings)) -> CpcbStationsResponse:
    """Alias of `/aqi/karnataka` — currently scoped to Karnataka; the
    Karnataka-specific route is kept for callers that want the state
    explicit in the URL."""
    return await get_karnataka_aqi(settings)


@router.get("/aqi/stations/{station_id}", response_model=CpcbStation)
async def get_aqi_station(
    station_id: str, settings: Settings = Depends(get_settings)
) -> CpcbStation:
    stations, _, _ = await aggregator.get_karnataka_stations(get_redis_client(), settings)
    for station in stations:
        if station.station_id == station_id:
            return station
    raise StationNotFoundError(station_id)


@router.get("/aqi/cities", response_model=CpcbCitiesResponse)
async def list_aqi_cities(settings: Settings = Depends(get_settings)) -> CpcbCitiesResponse:
    stations, _, _ = await aggregator.get_karnataka_stations(get_redis_client(), settings)
    cities = sorted({station.city for station in stations if station.city})
    return CpcbCitiesResponse(state="Karnataka", cities=cities)


@router.get("/aqi/summary", response_model=CpcbSummaryResponse)
async def get_aqi_summary(settings: Settings = Depends(get_settings)) -> CpcbSummaryResponse:
    stations, data_status, fetched_at = await aggregator.get_karnataka_stations(
        get_redis_client(), settings
    )
    category_counts: dict[str, int] = {}
    for station in stations:
        if station.aqi_category is not None:
            category_counts[station.aqi_category.value] = (
                category_counts.get(station.aqi_category.value, 0) + 1
            )
    return CpcbSummaryResponse(
        state="Karnataka",
        station_count=len(stations),
        city_count=len({station.city for station in stations if station.city}),
        category_counts=category_counts,
        data_status=data_status,
        fetched_at=fetched_at,
    )


@router.get("/aqi/national/geojson", response_model=GeoJsonFeatureCollection)
async def list_national_aqi_geojson(
    settings: Settings = Depends(get_settings),
) -> GeoJsonFeatureCollection:
    """All-India official CPCB AQI monitoring stations as a GeoJSON
    FeatureCollection — one Point feature per physical station."""
    try:
        stations, _, _ = await aggregator.get_cpcb_stations(get_redis_client(), settings, None)
    except Exception:
        return GeoJsonFeatureCollection(type="FeatureCollection", features=[])
    return stations_to_geojson(stations)


@router.get("/aqi/grid", response_model=AqiGridResponse)
async def get_aqi_grid() -> AqiGridResponse:
    """Modeled Open-Meteo air-quality surface (pm2.5 + US AQI) over a regular
    ~1° grid covering the all-India domain. Returns gridded, MODELED data —
    never a substitute for official CPCB station readings. The grid is cached
    server-side (30 min TTL)."""
    return await aggregator.get_aqi_grid(get_redis_client())
