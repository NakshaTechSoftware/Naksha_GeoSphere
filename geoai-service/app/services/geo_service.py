"""Adapters for existing GeoSphere APIs (Feature 8).

This is the *only* place in the service that speaks HTTP to the Next.js
BFF (geocode, routing, land-records, datasets) or the FastAPI backend
(environment, pricing). The AI agent never sees these base URLs — they
come from settings, which come from environment variables.
"""

from __future__ import annotations

from typing import Any

import httpx

from app.config.settings import get_settings
from app.core.exceptions import UpstreamError


def _client() -> httpx.AsyncClient:
    settings = get_settings()
    return httpx.AsyncClient(timeout=settings.upstream_timeout_seconds)


async def _get(base_url: str, path: str, params: dict[str, Any] | None = None) -> Any:
    async with _client() as client:
        try:
            resp = await client.get(f"{base_url}{path}", params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            raise UpstreamError(f"GET {path} failed: {exc}") from exc


async def _post(base_url: str, path: str, json_body: dict[str, Any]) -> Any:
    async with _client() as client:
        try:
            resp = await client.post(f"{base_url}{path}", json=json_body)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as exc:
            raise UpstreamError(f"POST {path} failed: {exc}") from exc


async def reverse_geocode(lat: float, lon: float) -> dict[str, Any]:
    settings = get_settings()
    data = await _get(settings.geosphere_web_base_url, "/api/geocode", {"lat": lat, "lon": lon})
    # The actual endpoint returns "shortName" (confirmed by calling it
    # directly), not "placeName" — the old key name here silently always
    # missed, falling back to the full multi-part label every time.
    return {"label": data.get("label"), "place_name": data.get("shortName") or data.get("label")}


async def search_place(query: str) -> list[dict[str, Any]]:
    settings = get_settings()
    data = await _get(settings.geosphere_web_base_url, "/api/geocode", {"q": query})
    return [{"label": item["label"], "lat": item["lat"], "lon": item["lon"]} for item in data]


async def get_route(
    origin: tuple[float, float], destination: tuple[float, float], mode: str
) -> dict[str, Any]:
    settings = get_settings()
    body = {
        "origin": {"lat": origin[0], "lon": origin[1]},
        "destination": {"lat": destination[0], "lon": destination[1]},
        "mode": mode,
    }
    data = await _post(settings.geosphere_web_base_url, "/api/routing", body)
    return {
        "distance_meters": data.get("distance"),
        "duration_seconds": data.get("duration"),
        "geometry": data.get("geometry"),
    }


async def get_land_record(params: dict[str, str]) -> dict[str, Any]:
    settings = get_settings()
    data = await _get(settings.geosphere_web_base_url, "/api/land-records/rtc", params)
    return {"owners": data.get("owners", []), "use_case": data.get("useCase")}


async def get_environment_snapshot(lat: float, lon: float) -> dict[str, Any]:
    settings = get_settings()
    weather = await _get(
        settings.geosphere_api_base_url, "/api/v1/environment/current", {"lat": lat, "lon": lon}
    )
    air_quality = await _get(
        settings.geosphere_api_base_url, "/api/v1/environment/air-quality", {"lat": lat, "lon": lon}
    )
    return {"weather": weather, "air_quality": air_quality}


async def get_dataset_layer(layer: str, params: dict[str, str]) -> dict[str, Any]:
    settings = get_settings()
    return await _get(settings.geosphere_web_base_url, f"/api/datasets/{layer}", params)
