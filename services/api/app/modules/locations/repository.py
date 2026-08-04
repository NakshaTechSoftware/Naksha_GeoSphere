"""Data access for locations table."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.locations.models import Location, LocationType


class LocationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, location_id: uuid.UUID) -> Location | None:
        """Get location by ID."""
        result = await self._session.execute(
            select(Location).where(Location.id == location_id)
        )
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Location | None:
        """Get location by code (e.g., 'IN', 'IN-KA')."""
        result = await self._session.execute(
            select(Location).where(Location.code == code)
        )
        return result.scalar_one_or_none()

    async def get_all_countries(self) -> list[Location]:
        """Get all countries."""
        result = await self._session.execute(
            select(Location)
            .where(Location.location_type == LocationType.COUNTRY)
            .order_by(Location.display_order, Location.name)
        )
        return list(result.scalars().all())

    async def get_states_by_country(self, country_id: uuid.UUID) -> list[Location]:
        """Get all states in a country."""
        result = await self._session.execute(
            select(Location)
            .where(Location.location_type == LocationType.STATE)
            .where(Location.parent_id == country_id)
            .order_by(Location.display_order, Location.name)
        )
        return list(result.scalars().all())

    async def get_districts_by_state(self, state_id: uuid.UUID) -> list[Location]:
        """Get all districts in a state."""
        result = await self._session.execute(
            select(Location)
            .where(Location.location_type == LocationType.DISTRICT)
            .where(Location.parent_id == state_id)
            .order_by(Location.display_order, Location.name)
        )
        return list(result.scalars().all())

    async def get_children(self, parent_id: uuid.UUID) -> list[Location]:
        """Get all child locations of a parent."""
        result = await self._session.execute(
            select(Location)
            .where(Location.parent_id == parent_id)
            .order_by(Location.display_order, Location.name)
        )
        return list(result.scalars().all())

    async def get_hierarchy(self, location_id: uuid.UUID) -> Location | None:
        """Get location with all children loaded."""
        result = await self._session.execute(
            select(Location)
            .where(Location.id == location_id)
            .options(selectinload(Location.children))
        )
        return result.scalar_one_or_none()

    async def search_by_name(self, name: str, limit: int = 10) -> list[Location]:
        """Search locations by name (case-insensitive partial match)."""
        result = await self._session.execute(
            select(Location)
            .where(Location.name.ilike(f"%{name}%"))
            .order_by(Location.name)
            .limit(limit)
        )
        return list(result.scalars().all())
