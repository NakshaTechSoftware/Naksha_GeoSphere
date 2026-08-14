"""Response schemas for the environment module.

CPCB (measured) and Open-Meteo (modeled) air quality are intentionally
different types — `CpcbStation` vs `ModeledAirQuality` — so nothing in
this module can accidentally present one as the other. Every section that
depends on a third-party provider is wrapped in a `{status, data}`
envelope (`WeatherSection`, `OfficialAqiSection`, `ModeledAqiSection`) so
one provider failing never prevents the others from being returned.
"""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DataStatus = Literal["LIVE", "STALE"]


class SectionStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    UNAVAILABLE = "UNAVAILABLE"


class AqiSource(str, enum.Enum):
    """Where `CpcbStation.aqi_value` came from.

    SOURCE_CPCB      — the upstream feed itself published a final AQI value.
    CALCULATED_CPCB  — no published AQI existed; we derived one from the
                        station's pollutant concentrations using the
                        official CPCB National AQI sub-index breakpoint
                        table (never an arbitrary/invented formula).
    NOT_AVAILABLE    — neither a published value nor enough pollutant data
                        to calculate one; `aqi_value` is null.
    """

    SOURCE_CPCB = "SOURCE_CPCB"
    CALCULATED_CPCB = "CALCULATED_CPCB"
    NOT_AVAILABLE = "NOT_AVAILABLE"


class AqiCategory(str, enum.Enum):
    GOOD = "Good"
    SATISFACTORY = "Satisfactory"
    MODERATE = "Moderate"
    POOR = "Poor"
    VERY_POOR = "Very Poor"
    SEVERE = "Severe"


class DataQualityFlag(str, enum.Enum):
    INVALID_COORDINATES = "INVALID_COORDINATES"
    INVALID_VALUE = "INVALID_VALUE"
    MISSING_VALUE = "MISSING_VALUE"
    DUPLICATE_RECORD = "DUPLICATE_RECORD"


# --- Weather (Open-Meteo) ------------------------------------------------


class WeatherObservation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    latitude: float
    longitude: float
    temperature_c: float | None = None
    relative_humidity_percent: float | None = None
    precipitation_mm: float | None = None
    rain_mm: float | None = None
    wind_speed_kmh: float | None = None
    wind_direction_degrees: float | None = None
    wind_direction_compass: str | None = None
    surface_pressure_hpa: float | None = None
    observation_time: datetime | None = None
    source: Literal["Open-Meteo"] = "Open-Meteo"


class WeatherSection(BaseModel):
    status: SectionStatus
    data: WeatherObservation | None = None
    data_status: DataStatus | None = None
    fetched_at: datetime | None = None
    message: str | None = None


class WeatherResponse(WeatherObservation):
    """Flat single-provider response for `GET /environment/weather` — see
    spec section E. `observation_time` is when Open-Meteo took the reading;
    `fetched_at` is when *our* backend last pulled it (may be cache-served)."""

    data_status: DataStatus
    fetched_at: datetime


class DailyForecastDay(BaseModel):
    date: date
    weather_code: int | None = None
    temperature_max_c: float | None = None
    temperature_min_c: float | None = None
    precipitation_sum_mm: float | None = None
    precipitation_probability_max: float | None = None
    wind_speed_max_kmh: float | None = None


class DailyForecastResponse(BaseModel):
    latitude: float
    longitude: float
    days: list[DailyForecastDay]
    source: Literal["Open-Meteo"] = "Open-Meteo"
    data_status: DataStatus
    fetched_at: datetime


class HourlyForecastPoint(BaseModel):
    time: datetime
    temperature_c: float | None = None
    precipitation_probability_percent: float | None = None
    precipitation_mm: float | None = None
    wind_speed_kmh: float | None = None
    wind_direction_degrees: float | None = None
    wind_direction_compass: str | None = None


class HourlyForecastResponse(BaseModel):
    """Next-24-hour hourly series (local Asia/Kolkata time) for the My
    Environment charts — temperature, precipitation probability/amount and
    wind speed/direction, each kept as its own independent series so the UI
    can switch tabs without re-fetching."""

    latitude: float
    longitude: float
    points: list[HourlyForecastPoint]
    source: Literal["Open-Meteo"] = "Open-Meteo"
    data_status: DataStatus
    fetched_at: datetime


class GfsWindGridBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class GfsWindFrameResponse(BaseModel):
    source: Literal["NOAA GFS"] = "NOAA GFS"
    model: Literal["GFS 0.25°"] = "GFS 0.25°"
    run_time: datetime
    forecast_time: datetime
    forecast_hour: int
    bounds: GfsWindGridBounds
    width: int
    height: int
    dx: float
    dy: float
    latitudes: list[float]
    longitudes: list[float]
    u: list[float]
    v: list[float]
    data_status: DataStatus
    fetched_at: datetime


class GfsWeatherGridBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class GfsWeatherFieldFrameResponse(BaseModel):
    """A single NOAA GFS 0.25° grid for one scalar weather field (temperature,
    precipitation or cloud cover) over the all-India domain. The frontend
    colorizes `values` with its own stable palette, so this payload only
    carries the raw grid + provenance + axis metadata."""

    source: Literal["NOAA GFS"] = "NOAA GFS"
    model: Literal["GFS 0.25°"] = "GFS 0.25°"
    variable: Literal["temperature", "precipitation", "clouds"]
    run_time: datetime
    forecast_time: datetime
    forecast_hour: int
    bounds: GfsWeatherGridBounds
    width: int
    height: int
    dx: float
    dy: float
    latitudes: list[float]
    longitudes: list[float]
    unit: str
    values: list[float]
    data_status: DataStatus
    fetched_at: datetime


# --- Modeled air quality (Open-Meteo) ------------------------------------


class ModeledAirQuality(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    latitude: float
    longitude: float
    pm10: float | None = None
    pm2_5: float | None = None
    co: float | None = None
    no2: float | None = None
    so2: float | None = None
    o3: float | None = None
    us_aqi: float | None = None
    european_aqi: float | None = None
    observation_time: datetime | None = None
    source: Literal["Open-Meteo"] = "Open-Meteo"
    source_type: Literal["MODELED"] = "MODELED"


class ModeledAqiSection(BaseModel):
    status: SectionStatus
    data: ModeledAirQuality | None = None
    data_status: DataStatus | None = None
    fetched_at: datetime | None = None
    message: str | None = None


class AirQualityResponse(ModeledAirQuality):
    """Flat single-provider response for `GET /environment/air-quality`."""

    data_status: DataStatus
    fetched_at: datetime


# --- Official CPCB air quality --------------------------------------------


class PollutantReading(BaseModel):
    min: float | None = None
    avg: float | None = None
    max: float | None = None


class CpcbStation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    station_id: str
    station: str
    city: str
    state: str
    country: str
    latitude: float
    longitude: float
    last_update: datetime | None = None
    pollutants: dict[str, PollutantReading]
    aqi_value: int | None = None
    aqi_category: AqiCategory | None = None
    aqi_source: AqiSource
    source: Literal["CPCB / data.gov.in"] = "CPCB / data.gov.in"
    source_type: Literal["MEASURED"] = "MEASURED"


class NearestStation(BaseModel):
    station: CpcbStation
    distance_km: float


class OfficialAqiSection(BaseModel):
    status: SectionStatus
    data: CpcbStation | None = None
    distance_km: float | None = None
    data_status: DataStatus | None = None
    fetched_at: datetime | None = None
    message: str | None = None


# --- Aggregated responses --------------------------------------------------


class CurrentEnvironmentResponse(BaseModel):
    latitude: float
    longitude: float
    weather: WeatherSection
    modeled_air_quality: ModeledAqiSection


class LocationSummaryResponse(BaseModel):
    location: dict[str, float]
    weather: WeatherSection
    official_air_quality: OfficialAqiSection
    modeled_air_quality: ModeledAqiSection
    timestamps: dict[str, datetime | None] = Field(default_factory=dict)
    sources: dict[str, str] = Field(default_factory=dict)


# --- CPCB collection endpoints ---------------------------------------------


class CpcbStationsResponse(BaseModel):
    count: int
    data_status: DataStatus
    fetched_at: datetime
    stations: list[CpcbStation]


class CpcbCitiesResponse(BaseModel):
    state: str
    cities: list[str]


class CpcbSummaryResponse(BaseModel):
    state: str
    station_count: int
    city_count: int
    category_counts: dict[str, int]
    data_status: DataStatus
    fetched_at: datetime


class GeoJsonFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, object]
    properties: dict[str, object]


class GeoJsonFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJsonFeature]


# --- Modeled air-quality surface (gridded, Open-Meteo) ----------------------


class AqiGridPoint(BaseModel):
    """One point of a modeled air-quality surface grid."""

    latitude: float
    longitude: float
    pm2_5: float | None = None
    us_aqi: float | None = None
    data_status: DataStatus
    fetched_at: datetime


class AqiGridResponse(BaseModel):
    """Gridded modeled air-quality surface over a geographic area. Each point
    is an independent Open-Meteo modeled estimate, sampled on a regular grid.
    Never a substitute for official CPCB station readings."""

    bounds: GfsWeatherGridBounds
    width: int
    height: int
    points: list[AqiGridPoint]
    source: Literal["Open-Meteo"] = "Open-Meteo"
    source_type: Literal["MODELED"] = "MODELED"
    data_status: DataStatus
    fetched_at: datetime
