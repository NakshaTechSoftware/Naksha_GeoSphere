"""Adapter endpoints wrapping existing GeoSphere APIs (Feature 8).

Every route here proxies a real GeoSphere endpoint through geo_service.py
so the AI agent (or its runtime) only ever talks to this controlled,
typed surface — never to the Next.js BFF or FastAPI backend directly.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.config.settings import get_settings
from app.core.cache import build_key, cache_get, cache_set
from app.core.logging import ToolCallLogger
from app.core.rate_limit import enforce_rate_limit
from app.schemas.geoai_models import (
    DatasetLayerRequest,
    DatasetLayerResponse,
    EnvironmentSnapshotRequest,
    EnvironmentSnapshotResponse,
    LandRecordRequest,
    LandRecordResponse,
    ReverseGeocodeRequest,
    ReverseGeocodeResponse,
    RouteRequest,
    RouteResponse,
    SearchPlaceRequest,
    SearchPlaceResponse,
)
from app.services import geo_service

router = APIRouter(prefix="/geoai", tags=["geosphere-adapters"])


@router.post("/geocode/reverse", response_model=ReverseGeocodeResponse)
async def reverse_geocode(
    payload: ReverseGeocodeRequest, api_key: str = Depends(enforce_rate_limit)
) -> ReverseGeocodeResponse:
    settings = get_settings()
    cache_key = build_key("geocode", "reverse", payload.lat, payload.lon)

    with ToolCallLogger.timed("reverse_geocode", api_key, payload.model_dump()):
        cached = await cache_get(cache_key)
        if cached is not None:
            return ReverseGeocodeResponse(**cached, cached=True)

        data = await geo_service.reverse_geocode(payload.lat, payload.lon)
        response = ReverseGeocodeResponse(**data)
        await cache_set(
            cache_key, response.model_dump(exclude={"cached"}), settings.cache_ttl_geocode_seconds
        )
        return response


@router.post("/geocode/search", response_model=SearchPlaceResponse)
async def search_place(
    payload: SearchPlaceRequest, api_key: str = Depends(enforce_rate_limit)
) -> SearchPlaceResponse:
    with ToolCallLogger.timed("search_place", api_key, payload.model_dump()):
        results = await geo_service.search_place(payload.query)
        return SearchPlaceResponse(results=results)


@router.post("/route", response_model=RouteResponse)
async def get_route(payload: RouteRequest, api_key: str = Depends(enforce_rate_limit)) -> RouteResponse:
    with ToolCallLogger.timed("get_route", api_key, payload.model_dump()):
        data = await geo_service.get_route(
            (payload.origin.lat, payload.origin.lon),
            (payload.destination.lat, payload.destination.lon),
            payload.mode,
        )
        return RouteResponse(**data)


@router.post("/land-record", response_model=LandRecordResponse)
async def land_record(
    payload: LandRecordRequest, api_key: str = Depends(enforce_rate_limit)
) -> LandRecordResponse:
    with ToolCallLogger.timed("get_land_record", api_key, payload.model_dump()):
        data = await geo_service.get_land_record(payload.model_dump())
        return LandRecordResponse(**data)


@router.post("/environment", response_model=EnvironmentSnapshotResponse)
async def environment_snapshot(
    payload: EnvironmentSnapshotRequest, api_key: str = Depends(enforce_rate_limit)
) -> EnvironmentSnapshotResponse:
    with ToolCallLogger.timed("get_environment_snapshot", api_key, payload.model_dump()):
        data = await geo_service.get_environment_snapshot(payload.lat, payload.lon)
        return EnvironmentSnapshotResponse(**data)


@router.post("/dataset-layer", response_model=DatasetLayerResponse)
async def dataset_layer(
    payload: DatasetLayerRequest, api_key: str = Depends(enforce_rate_limit)
) -> DatasetLayerResponse:
    with ToolCallLogger.timed("get_dataset_layer", api_key, payload.model_dump()):
        data = await geo_service.get_dataset_layer(payload.layer, payload.params)
        return DatasetLayerResponse(feature_collection=data)
