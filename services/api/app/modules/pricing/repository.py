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
        lgd_village_code: str | None = None,
        bhucode: str | None = None,
        mapping_method: str | None = None,
        resolved_at: "datetime | None" = None,
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
            lgd_village_code=lgd_village_code,
            bhucode=bhucode,
            mapping_method=mapping_method,
            resolved_at=resolved_at,
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
                "lgd_village_code": stmt.excluded.lgd_village_code,
                "bhucode": stmt.excluded.bhucode,
                "mapping_method": stmt.excluded.mapping_method,
                "resolved_at": stmt.excluded.resolved_at,
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

    async def rollback(self) -> None:
        await self._session.rollback()

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

    async def get_fresh_rate_entries_for_road(
        self, kaveri_village_code: str, road_code: str
    ) -> list[KaveriRateCache] | None:
        """Every fresh cached rate row for one (village, road) — the full
        candidate set Kaveri returned there, not one parcel's selection.
        Returns None (a genuine miss, not an empty list) when nothing fresh is
        cached for this road at all, so the caller knows to hit Kaveri live;
        callers must still apply their own parcel-specific selection to
        whatever this returns (spec Part 11/14 — cache the catalogue once,
        select per parcel every time)."""
        result = await self._session.execute(
            select(KaveriRateCache).where(
                KaveriRateCache.kaveri_village_code == kaveri_village_code,
                KaveriRateCache.road_code == road_code,
            )
        )
        rows = list(result.scalars().all())
        if not rows:
            return None
        fresh = [r for r in rows if datetime.now(timezone.utc) - r.updated_at <= RATE_CACHE_TTL]
        return fresh or None

    async def upsert_rate_cache_bulk(
        self,
        kaveri_village_code: str,
        road_code: str,
        entries: list[dict],
        *,
        road_confidence: Decimal,
        road_resolution_method: str,
        classification: str,
    ) -> None:
        """Caches EVERY rate entry Kaveri returned for a road (not just the
        one a particular parcel selected), so the next parcel on the same
        road/locality can skip the live Kaveri calls entirely while still
        resolving its own category independently.

        Written as ONE multi-row statement + ONE commit, not N sequential
        auto-committing calls — a real production incident showed why: an
        earlier per-entry-commit version left a road's cache holding only
        the first 1 of 5 real categories after a later entry's write failed
        (a too-narrow column), and callers had no way to tell that
        "1 cached entry" meant "the other 4 are missing" rather than
        "Kaveri only has 1 category here". Atomic means either every entry
        for this road is cached, or none are — the cache can never be
        silently partial."""
        if not entries:
            return
        stmt = pg_insert(KaveriRateCache).values(
            [
                {
                    "kaveri_village_code": kaveri_village_code,
                    "road_code": road_code,
                    "property_type": entry["label"],
                    "standard_rate": entry["rate"],
                    "rate_unit": entry["rate_unit"],
                    "road_confidence": road_confidence,
                    "road_resolution_method": road_resolution_method,
                    "classification": classification,
                }
                for entry in entries
            ]
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_kaveri_rate_cache_village_road_property",
            set_={
                "standard_rate": stmt.excluded.standard_rate,
                "rate_unit": stmt.excluded.rate_unit,
                "road_confidence": stmt.excluded.road_confidence,
                "road_resolution_method": stmt.excluded.road_resolution_method,
                "classification": stmt.excluded.classification,
            },
        )
        await self._session.execute(stmt)
        await self._session.commit()

    async def upsert_rate_cache(
        self,
        kaveri_village_code: str,
        road_code: str,
        property_type: str,
        standard_rate: Decimal,
        *,
        rate_unit: str,
        road_confidence: Decimal,
        road_resolution_method: str,
        classification: str,
    ) -> None:
        stmt = pg_insert(KaveriRateCache).values(
            kaveri_village_code=kaveri_village_code,
            road_code=road_code,
            property_type=property_type,
            standard_rate=standard_rate,
            rate_unit=rate_unit,
            road_confidence=road_confidence,
            road_resolution_method=road_resolution_method,
            classification=classification,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_kaveri_rate_cache_village_road_property",
            set_={
                "standard_rate": stmt.excluded.standard_rate,
                "rate_unit": stmt.excluded.rate_unit,
                "road_confidence": stmt.excluded.road_confidence,
                "road_resolution_method": stmt.excluded.road_resolution_method,
                "classification": stmt.excluded.classification,
            },
        )
        await self._session.execute(stmt)
        await self._session.commit()
