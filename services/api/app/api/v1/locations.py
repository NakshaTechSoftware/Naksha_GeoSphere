"""API endpoints for locations."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_session
from app.modules.locations.models import LocationType
from app.modules.locations.repository import LocationRepository
from app.modules.locations.schemas import LocationPublic, LocationWithChildren

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/", response_model=list[LocationPublic])
async def list_locations(
    location_type: LocationType | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[LocationPublic]:
    """List all locations, optionally filtered by type."""
    repo = LocationRepository(session)
    
    if location_type == LocationType.COUNTRY:
        locations = await repo.get_all_countries()
    else:
        # Get all locations - could add pagination here
        from sqlalchemy import select
        from app.modules.locations.models import Location
        result = await session.execute(
            select(Location).order_by(Location.location_type, Location.name)
        )
        locations = list(result.scalars().all())
    
    return [LocationPublic.model_validate(loc) for loc in locations]


@router.get("/countries", response_model=list[LocationPublic])
async def list_countries(
    session: AsyncSession = Depends(get_session),
) -> list[LocationPublic]:
    """List all countries."""
    repo = LocationRepository(session)
    countries = await repo.get_all_countries()
    return [LocationPublic.model_validate(c) for c in countries]


@router.get("/countries/{country_id}/states", response_model=list[LocationPublic])
async def list_states(
    country_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[LocationPublic]:
    """List all states in a country."""
    repo = LocationRepository(session)
    
    # Verify country exists
    country = await repo.get_by_id(country_id)
    if not country:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Country {country_id} not found"
        )
    
    states = await repo.get_states_by_country(country_id)
    return [LocationPublic.model_validate(s) for s in states]


@router.get("/states/{state_id}/districts", response_model=list[LocationPublic])
async def list_districts(
    state_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> list[LocationPublic]:
    """List all districts in a state."""
    repo = LocationRepository(session)
    
    # Verify state exists
    state = await repo.get_by_id(state_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"State {state_id} not found"
        )
    
    districts = await repo.get_districts_by_state(state_id)
    return [LocationPublic.model_validate(d) for d in districts]


@router.get("/{location_id}", response_model=LocationWithChildren)
async def get_location(
    location_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> LocationWithChildren:
    """Get a location by ID with its children."""
    repo = LocationRepository(session)
    location = await repo.get_hierarchy(location_id)
    
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location {location_id} not found"
        )
    
    return LocationWithChildren.model_validate(location)


@router.get("/code/{code}", response_model=LocationPublic)
async def get_location_by_code(
    code: str,
    session: AsyncSession = Depends(get_session),
) -> LocationPublic:
    """Get a location by code (e.g., 'IN', 'IN-KA', 'IN-KA-BLR')."""
    repo = LocationRepository(session)
    location = await repo.get_by_code(code)
    
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location with code '{code}' not found"
        )
    
    return LocationPublic.model_validate(location)


@router.get("/search/", response_model=list[LocationPublic])
async def search_locations(
    q: str,
    limit: int = 10,
    session: AsyncSession = Depends(get_session),
) -> list[LocationPublic]:
    """Search locations by name."""
    repo = LocationRepository(session)
    locations = await repo.search_by_name(q, limit)
    return [LocationPublic.model_validate(loc) for loc in locations]
