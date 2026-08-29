"""PostGIS-ready POI models (Feature 7).

Five point-of-interest tables, one per supported /geoai/nearby type, each
with the identical shape requested: id, name, category, address, phone,
a SRID-4326 POINT geometry, and timestamps. A GiST index on `geometry` is
what makes ST_DWithin/ST_Distance in nearby_service.py fast — see
migrations/002_poi_tables.sql for the exact DDL these models mirror.

Kept as five explicit tables (not one polymorphic table) to match the
existing GeoSphere convention of one physical table per real-world
feature type (see services/api/app/modules/datasets/models.py), and so
each layer can evolve its own attributes independently later.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class PoiBase(Base):
    """Shared column layout for every poi_* table. Not mapped to a table itself."""

    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    geometry: Mapped[str] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PoiPoliceStation(PoiBase):
    __tablename__ = "poi_police_station"


class PoiHospital(PoiBase):
    __tablename__ = "poi_hospital"


class PoiSchool(PoiBase):
    __tablename__ = "poi_school"


class PoiAtm(PoiBase):
    __tablename__ = "poi_atm"


class PoiPharmacy(PoiBase):
    __tablename__ = "poi_pharmacy"


# type -> model, used by nearby_service.py to resolve /geoai/nearby's `type` field.
POI_TYPE_MODEL_MAP: dict[str, type[PoiBase]] = {
    "police_station": PoiPoliceStation,
    "hospital": PoiHospital,
    "school": PoiSchool,
    "atm": PoiAtm,
    "pharmacy": PoiPharmacy,
}
