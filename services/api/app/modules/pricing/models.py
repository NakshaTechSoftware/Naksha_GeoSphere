"""SQLAlchemy models for Kaveri government guideline value ("SR Rate")
lookups.

Kaveri Online Services (the Karnataka govt land-valuation portal) keys its
District/Taluk/Hobli/Village hierarchy on its own internal codes, which do
NOT match this platform's KGIS village codes — `KaveriVillageMapping` is the
curated crosswalk between the two, looked up by `kgis_village_code` before
any Kaveri API call is made. `KaveriRateCache` avoids re-hitting Kaveri on
every parcel click: a row is reused while still fresh (see
`app.modules.pricing.repository`'s freshness check) and only re-fetched once
stale.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Numeric, String, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class MappingStatus(str, enum.Enum):
    """Confidence in a `KaveriVillageMapping` row, set by
    `village_matching.match_village`'s score band. Only `CONFIRMED` rows are
    ever used to power the guideline-value popup (see
    `repository.get_mapping_by_kgis_code`) — `PENDING_REVIEW` is a plausible
    guess a human hasn't signed off on yet, not a usable mapping."""

    CONFIRMED = "confirmed"
    PENDING_REVIEW = "pending_review"
    FAILED = "failed"


mapping_status_enum = SAEnum(
    MappingStatus,
    name="kaveri_mapping_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class KaveriVillageMapping(Base):
    """Crosswalk from a KGIS village code to Kaveri's own District/Taluk/
    Hobli/Village codes. Curated reference data — ships empty and is
    populated as specific villages are needed, not bulk-seeded."""

    __tablename__ = "kaveri_village_mapping"
    __table_args__ = (
        CheckConstraint("btrim(kgis_village_code) <> ''", name="ck_kaveri_village_mapping_kgis_code_not_blank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    kgis_village_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    village_name: Mapped[str] = mapped_column(String(200), nullable=False)
    district: Mapped[str] = mapped_column(String(100), nullable=False)
    taluk: Mapped[str] = mapped_column(String(100), nullable=False)
    hobli: Mapped[str] = mapped_column(String(100), nullable=False)
    kaveri_district_code: Mapped[str] = mapped_column(String(50), nullable=False)
    kaveri_taluk_code: Mapped[str] = mapped_column(String(50), nullable=False)
    kaveri_hobli_code: Mapped[str] = mapped_column(String(50), nullable=False)
    kaveri_village_code: Mapped[str] = mapped_column(String(50), nullable=False)
    # Corroborating government identifiers (spec Part 7/8). `lgd_village_code`
    # and `bhucode` are stored whenever available so a human reviewer can verify
    # the KGIS<->Kaveri crosswalk against the LGD / Bhoomi registries; they are
    # NEVER derived by a fabricated code transformation.
    lgd_village_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    bhucode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Manually-inserted rows (e.g. during earlier development) default to
    # CONFIRMED — only rows written by the generator's own fuzzy matching
    # ever land in PENDING_REVIEW/FAILED.
    mapping_status: Mapped[MappingStatus] = mapped_column(
        mapping_status_enum, nullable=False, server_default=MappingStatus.CONFIRMED.value
    )
    matching_score: Mapped[Decimal | None] = mapped_column(Numeric(precision=5, scale=2))
    # How the match was produced (spec Part 8): one of the resolver's `method`
    # values, e.g. "unique_village_within_taluk" / "unique_village_in_alternate_taluk".
    mapping_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class MappingGenerationProgress(Base):
    """Resume checkpoint for `scripts/generate_kaveri_village_mapping.py` —
    one row per KGIS village ever attempted, regardless of outcome. A re-run
    skips anything already present here rather than re-walking a village
    that's already confirmed, pending review, or failed."""

    __tablename__ = "kaveri_mapping_progress"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    kgis_village_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    status: Mapped[MappingStatus] = mapped_column(mapping_status_enum, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class KaveriRateCache(Base):
    """Last-fetched Kaveri SR Rate for a (village, road, property type)
    combination. `updated_at` drives the freshness check in
    `repository.KaveriPricingRepository.get_rate_cache` — a stale row is
    treated as a miss and re-fetched, then upserted here."""

    __tablename__ = "kaveri_rate_cache"
    __table_args__ = (
        UniqueConstraint(
            "kaveri_village_code",
            "road_code",
            "property_type",
            name="uq_kaveri_rate_cache_village_road_property",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    kaveri_village_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    road_code: Mapped[str] = mapped_column(String(50), nullable=False)
    # 255, not 50: Kaveri's own agricultural category labels are free text
    # and can run long — a real live example (Kodagu district) is 82
    # characters: "Dry, Paddy/Areca/Coconut/Mango/Grapes/Fruit grown with
    # rain water, Other Soil". A too-narrow column here previously caused a
    # silent `StringDataRightTruncationError` on every parcel whose
    # resolved category used a long label, masked as a generic
    # `kaveri_api_error` by the endpoint's broad exception handler.
    property_type: Mapped[str] = mapped_column(String(255), nullable=False)
    standard_rate: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    # Audit/provenance metadata (spec Part 10/13) — never used to decide
    # freshness (that's still `updated_at` + RATE_CACHE_TTL), only to explain
    # *why* a cached rate was trusted when it was written.
    rate_unit: Mapped[str | None] = mapped_column(String(20))
    road_confidence: Mapped[Decimal | None] = mapped_column(Numeric(precision=4, scale=3))
    road_resolution_method: Mapped[str | None] = mapped_column(String(30))
    classification: Mapped[str | None] = mapped_column(String(30))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
