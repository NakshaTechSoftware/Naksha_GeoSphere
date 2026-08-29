"""POST /geoai/query-layer — Feature 2."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import get_settings
from app.core.cache import build_key, cache_get, cache_set
from app.core.logging import ToolCallLogger
from app.core.rate_limit import enforce_rate_limit
from app.database.postgres import get_db_session
from app.schemas.geoai_models import SpatialQueryRequest, SpatialQueryResponse
from app.services.spatial_service import query_layer

router = APIRouter(prefix="/geoai", tags=["spatial-query"])


@router.post("/query-layer", response_model=SpatialQueryResponse)
async def query_layer_endpoint(
    payload: SpatialQueryRequest,
    api_key: str = Depends(enforce_rate_limit),
    session: AsyncSession = Depends(get_db_session),
) -> SpatialQueryResponse:
    settings = get_settings()
    lon, lat = payload.point
    cache_key = build_key("layer", payload.layer, payload.operation, lat, lon)

    with ToolCallLogger.timed("query_spatial_layer", api_key, payload.model_dump()):
        cached = await cache_get(cache_key)
        if cached is not None:
            return SpatialQueryResponse(**cached, cached=True)

        feature, source = await query_layer(session, payload.layer, lon, lat, payload.operation)
        response = SpatialQueryResponse(
            layer=payload.layer, operation=payload.operation, feature=feature, source=source
        )
        await cache_set(
            cache_key,
            response.model_dump(exclude={"cached"}),
            settings.cache_ttl_layer_query_seconds,
        )
        return response
