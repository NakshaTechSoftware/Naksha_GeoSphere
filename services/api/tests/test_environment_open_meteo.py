"""Tests for Open-Meteo response normalization.

Fixture payloads mirror the real API responses confirmed during
development (`current_units`/`current` shape, local-time `current.time`
with no UTC offset since `timezone=Asia/Kolkata` was requested).
"""

from __future__ import annotations

from app.modules.environment.open_meteo_client import (
    degrees_to_compass,
    parse_daily_forecast,
    parse_air_quality,
    parse_weather,
)

WEATHER_RAW = {
    "latitude": 12.970123,
    "longitude": 77.56364,
    "timezone": "Asia/Kolkata",
    "current_units": {
        "temperature_2m": "°C",
        "wind_speed_10m": "km/h",
        "surface_pressure": "hPa",
    },
    "current": {
        "time": "2026-08-12T12:00",
        "temperature_2m": 26.8,
        "relative_humidity_2m": 59,
        "precipitation": 0.0,
        "rain": 0.0,
        "wind_speed_10m": 16.5,
        "wind_direction_10m": 264,
        "surface_pressure": 911.6,
    },
}

AIR_QUALITY_RAW = {
    "latitude": 13.0,
    "longitude": 77.6,
    "current_units": {"pm10": "µg/m³", "us_aqi": "USAQI"},
    "current": {
        "time": "2026-08-12T11:30",
        "pm10": 12.4,
        "pm2_5": 7.1,
        "carbon_monoxide": 236.0,
        "nitrogen_dioxide": 5.9,
        "sulphur_dioxide": 3.8,
        "ozone": 52.0,
        "us_aqi": 48,
        "european_aqi": 21,
    },
}

DAILY_FORECAST_RAW = {
    "latitude": 12.970123,
    "longitude": 77.56364,
    "timezone": "Asia/Kolkata",
    "daily_units": {
        "weather_code": "wmo code",
        "temperature_2m_max": "°C",
        "temperature_2m_min": "°C",
        "precipitation_sum": "mm",
        "precipitation_probability_max": "%",
        "wind_speed_10m_max": "km/h",
    },
    "daily": {
        "time": ["2026-08-12", "2026-08-13", "2026-08-14"],
        "weather_code": [3, 61, 95],
        "temperature_2m_max": [27.4, 26.1, 25.8],
        "temperature_2m_min": [20.2, 19.8, 19.4],
        "precipitation_sum": [0.0, 5.2, 14.7],
        "precipitation_probability_max": [12, 68, 91],
        "wind_speed_10m_max": [18.4, 22.1, 30.5],
    },
}


def test_parse_weather_maps_fields_and_units() -> None:
    obs = parse_weather(WEATHER_RAW, latitude=12.9716, longitude=77.5946)
    assert obs.temperature_c == 26.8
    assert obs.relative_humidity_percent == 59
    assert obs.wind_speed_kmh == 16.5
    assert obs.wind_direction_degrees == 264
    assert obs.surface_pressure_hpa == 911.6
    assert obs.source == "Open-Meteo"
    # Requested coordinates are preserved, not Open-Meteo's snapped grid point.
    assert obs.latitude == 12.9716
    assert obs.longitude == 77.5946


def test_parse_weather_tags_local_time_as_ist() -> None:
    obs = parse_weather(WEATHER_RAW, latitude=12.9716, longitude=77.5946)
    assert obs.observation_time is not None
    assert obs.observation_time.isoformat() == "2026-08-12T12:00:00+05:30"


def test_parse_air_quality_maps_frontend_friendly_names() -> None:
    aq = parse_air_quality(AIR_QUALITY_RAW, latitude=12.9716, longitude=77.5946)
    assert aq.pm10 == 12.4
    assert aq.pm2_5 == 7.1
    assert aq.co == 236.0
    assert aq.no2 == 5.9
    assert aq.so2 == 3.8
    assert aq.o3 == 52.0
    assert aq.us_aqi == 48
    assert aq.european_aqi == 21
    assert aq.source_type == "MODELED"


def test_parse_daily_forecast_maps_days_in_order() -> None:
    days = parse_daily_forecast(DAILY_FORECAST_RAW)
    assert len(days) == 3
    assert days[0].date.isoformat() == "2026-08-12"
    assert days[1].weather_code == 61
    assert days[2].temperature_max_c == 25.8
    assert days[2].precipitation_probability_max == 91
    assert days[2].wind_speed_max_kmh == 30.5


def test_parse_weather_handles_missing_current_gracefully() -> None:
    obs = parse_weather({}, latitude=1.0, longitude=2.0)
    assert obs.temperature_c is None
    assert obs.observation_time is None


def test_degrees_to_compass_all_points() -> None:
    assert degrees_to_compass(0) == "N"
    assert degrees_to_compass(45) == "NE"
    assert degrees_to_compass(90) == "E"
    assert degrees_to_compass(135) == "SE"
    assert degrees_to_compass(180) == "S"
    assert degrees_to_compass(225) == "SW"
    assert degrees_to_compass(270) == "W"
    assert degrees_to_compass(315) == "NW"
    assert degrees_to_compass(360) == "N"
    assert degrees_to_compass(None) is None
