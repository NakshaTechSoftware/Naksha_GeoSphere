"""Data access for the pricing module's two tables."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.pricing.models import (
    KaveriRateCache,
    KaveriVillageMapping,
    MappingGenerationProgress,
    MappingStatus,
)

# Guideline rates are revised infrequently (unlike weather/AQI) — a cached
# row is considered fresh for this long before a re-fetch is attempted.
RATE_CACHE_TTL = timedelta(days=30)


class KaveriPricingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_mapping_by_kgis_code(self, kgis_village_code: str) -> KaveriVillageMapping | None:
        """Returns a usable mapping — i.e. anything except FAILED. Both
        CONFIRMED (human-verified or high-confidence auto-resolved) and
        PENDING_REVIEW (a >=80%/<95% auto-resolution from the live resolver)
        are used to power the popup; a FAILED row means the resolver couldn't
        confidently place the location, so the caller degrades gracefully
        rather than presenting a bad value. A FAILED row is also left in place
        so we don't re-hammer Kaveri on every click for a location we already
        know we can't resolve."""
        result = await self._session.execute(
            select(KaveriVillageMapping).where(
                KaveriVillageMapping.kgis_village_code == kgis_village_code,
                KaveriVillageMapping.mapping_status != MappingStatus.FAILED,
            )
        )
        return result.scalar_one_or_none()

    async def upsert_village_mapping(
        self,
        *,
        kgis_village_code: str,
        village_name: str,
        district: str,
        taluk: str,
        hobli: str,
        kaveri_district_code: str,
        kaveri_taluk_code: str,
        kaveri_hobli_code: str,
        kaveri_village_code: str,
        mapping_status: MappingStatus,
        matching_score: Decimal,
    ) -> None:
        stmt = pg_insert(KaveriVillageMapping).values(
            kgis_village_code=kgis_village_code,
            village_name=village_name,
            district=district,
            taluk=taluk,
            hobli=hobli,
            kaveri_district_code=kaveri_district_code,
            kaveri_taluk_code=kaveri_taluk_code,
            kaveri_hobli_code=kaveri_hobli_code,
            kaveri_village_code=kaveri_village_code,
            mapping_status=mapping_status,
            matching_score=matching_score,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_kaveri_village_mapping_kgis_code",
            set_={
                "village_name": stmt.excluded.village_name,
                "district": stmt.excluded.district,
                "taluk": stmt.excluded.taluk,
                "hobli": stmt.excluded.hobli,
                "kaveri_district_code": stmt.excluded.kaveri_district_code,
                "kaveri_taluk_code": stmt.excluded.kaveri_taluk_code,
                "kaveri_hobli_code": stmt.excluded.kaveri_hobli_code,
                "kaveri_village_code": stmt.excluded.kaveri_village_code,
                "mapping_status": stmt.excluded.mapping_status,
                "matching_score": stmt.excluded.matching_score,
            },
        )
        await self._session.execute(stmt)

    async def get_progress(self, kgis_village_code: str) -> MappingGenerationProgress | None:
        result = await self._session.execute(
            select(MappingGenerationProgress).where(
                MappingGenerationProgress.kgis_village_code == kgis_village_code
            )
        )
        return result.scalar_one_or_none()

    async def get_processed_kgis_codes(self) -> set[str]:
        """Every KGIS village code already attempted, in one query — used to
        build the resume skip-set once per script run rather than a
        round-trip per village."""
        result = await self._session.execute(select(MappingGenerationProgress.kgis_village_code))
        return set(result.scalars().all())

    async def mark_progress(self, kgis_village_code: str, status: MappingStatus) -> None:
        stmt = pg_insert(MappingGenerationProgress).values(
            kgis_village_code=kgis_village_code, status=status
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_kaveri_mapping_progress_kgis_code",
            set_={"status": stmt.excluded.status, "processed_at": func.now()},
        )
        await self._session.execute(stmt)

    async def clear_progress(self) -> None:
        await self._session.execute(MappingGenerationProgress.__table__.delete())

    async def clear_mappings(self) -> None:
        await self._session.execute(KaveriVillageMapping.__table__.delete())

    async def commit(self) -> None:
        await self._session.commit()

    async def get_fresh_rate_cache_for_village(
        self, kaveri_village_code: str
    ) -> KaveriRateCache | None:
        """Looks up a cached guideline rate for a whole Kaveri village, without
        needing to know the road code or the property type first. Property-type
        discovery means a village's canonical rate (the highest-priority
        available land type) is what we cache & reuse, so a cache *hit* skips
        the live GetRoadDetailsAsync + rate calls entirely. Returns the most
        recently updated fresh row, or None if none is fresh."""
        result = await self._session.execute(
            select(KaveriRateCache)
            .where(KaveriRateCache.kaveri_village_code == kaveri_village_code)
            .order_by(KaveriRateCache.updated_at.desc())
        )
        row = result.scalars().first()
        if row is None:
            return None
        if datetime.now(timezone.utc) - row.updated_at > RATE_CACHE_TTL:
            return None
        return row

    async def get_fresh_rate_cache(
        self, kaveri_village_code: str, road_code: str, property_type: str
    ) -> KaveriRateCache | None:
        """Returns the cached rate row only if it's still within
        `RATE_CACHE_TTL` — a stale row is treated the same as a miss so the
        caller re-fetches from Kaveri and upserts a fresh one."""
        result = await self._session.execute(
            select(KaveriRateCache).where(
                KaveriRateCache.kaveri_village_code == kaveri_village_code,
                KaveriRateCache.road_code == road_code,
                KaveriRateCache.property_type == property_type,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        if datetime.now(timezone.utc) - row.updated_at > RATE_CACHE_TTL:
            return None
        return row

    async def upsert_rate_cache(
        self, kaveri_village_code: str, road_code: str, property_type: str, standard_rate: Decimal
    ) -> None:
        stmt = pg_insert(KaveriRateCache).values(
            kaveri_village_code=kaveri_village_code,
            road_code=road_code,
            property_type=property_type,
            standard_rate=standard_rate,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_kaveri_rate_cache_village_road_property",
            set_={"standard_rate": stmt.excluded.standard_rate},
        )
        await self._session.execute(stmt)
        await self._session.commit()
