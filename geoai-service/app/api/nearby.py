"""POST /geoai/nearby — Feature 1."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import build_key, cache_get, cache_set
from app.core.logging import ToolCallLogger
from app.core.rate_limit import enforce_rate_limit
from app.config.settings import get_settings
from app.database.postgres import get_db_session
from app.schemas.geoai_models import NearbyRequest, NearbyResponse
from app.services.nearby_service import find_nearby

router = APIRouter(prefix="/geoai", tags=["nearby"])


@router.post("/nearby", response_model=NearbyResponse)
async def nearby(
    payload: NearbyRequest,
    api_key: str = Depends(enforce_rate_limit),
    session: AsyncSession = Depends(get_db_session),
) -> NearbyResponse:
    settings = get_settings()
    cache_key = build_key("nearby", payload.type, payload.lat, payload.lon, payload.radius)

    with ToolCallLogger.timed("find_nearest_place", api_key, payload.model_dump()):
        cached = await cache_get(cache_key)
        if cached is not None:
            return NearbyResponse(**cached, cached=True)

        results, _source = await find_nearby(
            session, payload.type, payload.lat, payload.lon, payload.radius, payload.limit
        )
        response = NearbyResponse(results=results, cached=False)
        await cache_set(
            cache_key,
            response.model_dump(exclude={"cached"}),
            settings.cache_ttl_nearby_seconds,
        )
        return response
