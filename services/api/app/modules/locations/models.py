"""SQLAlchemy models for hierarchical location structure.

Supports country → state → district hierarchy for organizing geospatial
datasets by administrative boundaries.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class LocationType(str, enum.Enum):
    COUNTRY = "country"
    STATE = "state"
    DISTRICT = "district"


location_type_enum = SAEnum(
    LocationType,
    name="location_type",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class Location(Base):
    """Hierarchical location model: Country → State → District"""

    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name="ck_locations_name_not_blank"),
        CheckConstraint("btrim(code) <> ''", name="ck_locations_code_not_blank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    location_type: Mapped[LocationType] = mapped_column(
        location_type_enum, nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE"), index=True
    )
    # PostGIS geometry column for boundary polygon (SRID 4326 = WGS84)
    boundary: Mapped[str | None] = mapped_column(
        Geometry(geometry_type="MULTIPOLYGON", srid=4326)
    )
    description: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    parent: Mapped[Location | None] = relationship(
        "Location", remote_side=[id], back_populates="children"
    )
    children: Mapped[list[Location]] = relationship(
        "Location", back_populates="parent", cascade="all, delete-orphan"
    )
