"""SQLAlchemy models for geospatial dataset catalog.

Stores metadata about datasets; actual geospatial files (GeoTIFF, Shapefile,
etc.) are stored in S3/MinIO object storage referenced by `s3_key`.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geometry
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class DatasetType(str, enum.Enum):
    RASTER = "raster"
    VECTOR = "vector"
    LIDAR = "lidar"
    DEM = "dem"  # Digital Elevation Model


class DatasetStatus(str, enum.Enum):
    DRAFT = "draft"
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    ARCHIVED = "archived"


dataset_type_enum = SAEnum(
    DatasetType,
    name="dataset_type",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)

dataset_status_enum = SAEnum(
    DatasetStatus,
    name="dataset_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class Dataset(Base):
    """Geospatial dataset metadata catalog."""

    __tablename__ = "datasets"
    __table_args__ = (
        CheckConstraint("btrim(name) <> ''", name="ck_datasets_name_not_blank"),
        CheckConstraint("btrim(s3_key) <> ''", name="ck_datasets_s3_key_not_blank"),
        CheckConstraint(
            "file_size_bytes > 0", name="ck_datasets_file_size_bytes_positive"
        ),
        CheckConstraint("price_per_sqkm >= 0", name="ck_datasets_price_per_sqkm_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    dataset_type: Mapped[DatasetType] = mapped_column(
        dataset_type_enum, nullable=False, index=True
    )
    status: Mapped[DatasetStatus] = mapped_column(
        dataset_status_enum,
        nullable=False,
        server_default=DatasetStatus.DRAFT.value,
        index=True,
    )

    # Location reference
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Geospatial metadata
    # Bounding box (used for spatial queries and map search)
    bounding_box: Mapped[str] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326), nullable=False
    )
    # Spatial index will be created in migration
    file_format: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # GeoTIFF, Shapefile, LAZ, etc.
    coordinate_system: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default="EPSG:4326"
    )
    resolution_meters: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # Object storage reference
    s3_bucket: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # e.g., geosphere-source-data
    s3_key: Mapped[str] = mapped_column(
        String(500), nullable=False, unique=True
    )  # e.g., india/karnataka/satellite_2024.tif
    file_size_bytes: Mapped[int] = mapped_column(nullable=False)

    # Preview/thumbnail
    preview_s3_key: Mapped[str | None] = mapped_column(String(500))

    # Pricing
    price_per_sqkm: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, server_default="0"
    )

    # Additional metadata (flexible JSON storage)
    # Use 'extra_metadata' instead of 'metadata' (SQLAlchemy reserved name)
    extra_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    # Example extra_metadata:
    # {
    #   "capture_date": "2024-01-15",
    #   "satellite": "Sentinel-2",
    #   "cloud_cover": 5.2,
    #   "bands": ["red", "green", "blue", "nir"]
    # }

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    location: Mapped["Location"] = relationship("Location", lazy="joined")
