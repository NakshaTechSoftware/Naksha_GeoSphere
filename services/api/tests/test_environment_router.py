"""Endpoint-level tests for the environment module, using respx to mock
the external Open-Meteo/CPCB HTTP calls — no real network access needed.
"""

from __future__ import annotations

import httpx
import pytest
import pytest_asyncio
import respx

from app.modules.environment import cpcb_client, open_meteo_client
from app.services.redis_client import get_redis_client

OPEN_METEO_WEATHER_OK = {
    "current_units": {"temperature_2m": "°C"},
    "current": {
        "time": "2026-08-12T12:00",
        "temperature_2m": 28.4,
        "relative_humidity_2m": 67,
        "precipitation": 0,
        "rain": 0,
        "wind_speed_10m": 9.4,
        "wind_direction_10m": 225,
        "surface_pressure": 912,
    },
}

OPEN_METEO_DAILY_FORECAST_OK = {
    "daily_units": {
        "weather_code": "wmo code",
        "temperature_2m_max": "°C",
        "temperature_2m_min": "°C",
        "precipitation_sum": "mm",
        "precipitation_probability_max": "%",
        "wind_speed_10m_max": "km/h",
    },
    "daily": {
        "time": [
            "2026-08-12",
            "2026-08-13",
            "2026-08-14",
            "2026-08-15",
            "2026-08-16",
        ],
        "weather_code": [3, 61, 61, 95, 2],
        "temperature_2m_max": [28.4, 27.2, 26.8, 25.4, 27.9],
        "temperature_2m_min": [20.1, 19.8, 19.6, 19.2, 20.0],
        "precipitation_sum": [0.0, 3.4, 5.1, 18.2, 0.4],
        "precipitation_probability_max": [10, 48, 63, 91, 18],
        "wind_speed_10m_max": [18.0, 22.4, 24.8, 31.2, 19.5],
    },
}

OPEN_METEO_AIR_QUALITY_OK = {
    "current_units": {"pm10": "µg/m³"},
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

CPCB_KARNATAKA_OK = {
    "total": 2,
    "records": [
        {
            "country": "India",
            "state": "Karnataka",
            "city": "Bengaluru",
            "station": "Silk Board, Bengaluru - KSPCB",
            "last_update": "12-08-2026 10:00:00",
            "latitude": "12.917348",
            "longitude": "77.622813",
            "pollutant_id": "PM2.5",
            "min_value": "44",
            "max_value": "149",
            "avg_value": "101",
        },
        {
            "country": "India",
            "state": "Karnataka",
            "city": "Bengaluru",
            "station": "Silk Board, Bengaluru - KSPCB",
            "last_update": "12-08-2026 10:00:00",
            "latitude": "12.917348",
            "longitude": "77.622813",
            "pollutant_id": "NO2",
            "min_value": "20",
            "max_value": "40",
            "avg_value": "30",
        },
    ],
}


@pytest_asyncio.fixture(autouse=True)
async def _flush_environment_cache() -> None:
    """Router tests use fixed test coordinates across many test cases; flush
    the environment cache first so one test's mocked response can never be
    served (from a real Redis, if one happens to be reachable) to another
    test expecting a different mocked response. No-op if Redis isn't
    reachable (matches the module's own fail-open behavior)."""
    try:
        redis = get_redis_client()
        keys = [key async for key in redis.scan_iter("environment:*")]
        if keys:
            await redis.delete(*keys)
    except Exception:  # noqa: BLE001
        pass


@pytest.mark.asyncio
@respx.mock
async def test_weather_endpoint_returns_normalized_data(client: httpx.AsyncClient) -> None:
    respx.get(open_meteo_client.WEATHER_BASE_URL).mock(
        return_value=httpx.Response(200, json=OPEN_METEO_WEATHER_OK)
    )
    response = await client.get(
        "/api/v1/environment/weather", params={"latitude": 12.9716, "longitude": 77.5946}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["temperature_c"] == 28.4
    assert body["wind_direction_compass"] == "SW"
    assert body["source"] == "Open-Meteo"
    assert body["data_status"] == "LIVE"


@pytest.mark.asyncio
@respx.mock
async def test_weather_endpoint_rejects_out_of_range_latitude(client: httpx.AsyncClient) -> None:
    response = await client.get(
        "/api/v1/environment/weather", params={"latitude": 200, "longitude": 77.5946}
    )
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
@respx.mock
async def test_weather_endpoint_returns_clean_message_on_upstream_failure(
    client: httpx.AsyncClient,
) -> None:
    respx.get(open_meteo_client.WEATHER_BASE_URL).mock(side_effect=httpx.ConnectError("boom"))
    response = await client.get(
        "/api/v1/environment/weather", params={"latitude": 10.1, "longitude": 76.1}
    )
    assert response.status_code == 503
    body = response.json()
    assert body["error_code"] == "UPSTREAM_UNAVAILABLE"
    # Never leak the raw exception/traceback to the client.
    assert "ConnectError" not in response.text
    assert "Traceback" not in response.text


@pytest.mark.asyncio
@respx.mock
async def test_current_endpoint_isolates_one_provider_failure(client: httpx.AsyncClient) -> None:
    """Weather succeeds, air quality fails — /current must still return the
    weather section rather than failing the whole request (spec section S)."""
    respx.get(open_meteo_client.WEATHER_BASE_URL).mock(
        return_value=httpx.Response(200, json=OPEN_METEO_WEATHER_OK)
    )
    respx.get(open_meteo_client.AIR_QUALITY_BASE_URL).mock(side_effect=httpx.ConnectError("boom"))

    response = await client.get(
        "/api/v1/environment/current", params={"latitude": 15.3, "longitude": 75.7}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["weather"]["status"] == "AVAILABLE"
    assert body["weather"]["data"]["temperature_c"] == 28.4
    assert body["modeled_air_quality"]["status"] == "UNAVAILABLE"
    assert body["modeled_air_quality"]["data"] is None
    assert "temporarily unavailable" in body["modeled_air_quality"]["message"]


@pytest.mark.asyncio
@respx.mock
async def test_daily_forecast_endpoint_returns_five_day_forecast(
    client: httpx.AsyncClient,
) -> None:
    respx.get(open_meteo_client.WEATHER_BASE_URL).mock(
        return_value=httpx.Response(200, json=OPEN_METEO_DAILY_FORECAST_OK)
    )

    response = await client.get(
        "/api/v1/environment/daily-forecast",
        params={"latitude": 12.9716, "longitude": 77.5946},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "Open-Meteo"
    assert body["data_status"] == "LIVE"
    assert len(body["days"]) == 5
    assert body["days"][0]["date"] == "2026-08-12"
    assert body["days"][3]["weather_code"] == 95
    assert body["days"][3]["precipitation_probability_max"] == 91


@pytest.mark.asyncio
@respx.mock
async def test_aqi_summary_missing_api_key_returns_clean_503(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    response = await client.get("/api/v1/environment/aqi/summary")
    assert response.status_code == 503
    assert response.json()["error_code"] == "CPCB_API_KEY_MISSING"


@pytest.mark.asyncio
@respx.mock
async def test_aqi_geojson_is_a_valid_feature_collection(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "test-key")
    respx.get(cpcb_client.BASE_URL).mock(return_value=httpx.Response(200, json=CPCB_KARNATAKA_OK))

    response = await client.get("/api/v1/environment/aqi/geojson")
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    feature = body["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Point"
    assert feature["geometry"]["coordinates"] == [77.622813, 12.917348]
    assert feature["properties"]["source"] == "CPCB / data.gov.in"
    assert feature["properties"]["source_type"] == "MEASURED"


@pytest.mark.asyncio
@respx.mock
async def test_official_and_modeled_air_quality_never_merged(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """location-summary must keep CPCB (measured) and Open-Meteo (modeled)
    as clearly separate sections, never combined into one figure."""
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", "test-key")
    respx.get(open_meteo_client.WEATHER_BASE_URL).mock(
        return_value=httpx.Response(200, json=OPEN_METEO_WEATHER_OK)
    )
    respx.get(open_meteo_client.AIR_QUALITY_BASE_URL).mock(
        return_value=httpx.Response(200, json=OPEN_METEO_AIR_QUALITY_OK)
    )
    respx.get(cpcb_client.BASE_URL).mock(return_value=httpx.Response(200, json=CPCB_KARNATAKA_OK))

    response = await client.get(
        "/api/v1/environment/location-summary",
        params={"latitude": 12.917348, "longitude": 77.622813},
    )
    assert response.status_code == 200
    body = response.json()

    official = body["official_air_quality"]["data"]
    modeled = body["modeled_air_quality"]["data"]
    assert official["source"] == "CPCB / data.gov.in"
    assert official["source_type"] == "MEASURED"
    assert modeled["source"] == "Open-Meteo"
    assert modeled["source_type"] == "MODELED"
    # Distinct schemas — official has no us_aqi/european_aqi, modeled has no station.
    assert "station" not in modeled
    assert "us_aqi" not in official


@pytest.mark.asyncio
@respx.mock
async def test_response_never_contains_the_api_key(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret_key = "579b464db66ec23bdd00000197fb0acc86f144c2633e07a6ea54de3c"
    monkeypatch.setenv("DATA_GOV_IN_API_KEY", secret_key)
    respx.get(cpcb_client.BASE_URL).mock(return_value=httpx.Response(200, json=CPCB_KARNATAKA_OK))

    response = await client.get("/api/v1/environment/aqi/karnataka")
    assert secret_key not in response.text

    error_response = await client.get(
        "/api/v1/environment/weather", params={"latitude": 999, "longitude": 0}
    )
    assert secret_key not in error_response.text
