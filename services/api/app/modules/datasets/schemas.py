"""Response schemas for datasets module."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.datasets.models import DatasetStatus, DatasetType
from app.modules.locations.schemas import LocationBase


class DatasetBase(BaseModel):
    """Base dataset schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    dataset_type: DatasetType
    status: DatasetStatus
    file_format: str
    coordinate_system: str
    resolution_meters: Decimal | None
    file_size_bytes: int
    price_per_sqkm: Decimal


class DatasetPublic(DatasetBase):
    """Public dataset schema with location and metadata."""

    location_id: uuid.UUID
    location: LocationBase
    s3_bucket: str
    s3_key: str
    preview_s3_key: str | None
    extra_metadata: dict | None
    created_at: datetime
    updated_at: datetime


class DatasetWithDownloadUrl(DatasetPublic):
    """Dataset with temporary download URL (for purchased datasets)."""

    download_url: str = Field(description="Temporary signed S3 URL (expires in 15 min)")
    expires_at: datetime = Field(description="Download URL expiration time")


class DatasetCreate(BaseModel):
    """Schema for creating a new dataset."""

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    dataset_type: DatasetType
    location_id: uuid.UUID
    bounding_box_wkt: str = Field(
        description="WKT format: 'POLYGON((lon1 lat1, lon2 lat2, ...))'"
    )
    file_format: str = Field(min_length=1, max_length=50)
    coordinate_system: str = "EPSG:4326"
    resolution_meters: Decimal | None = None
    s3_bucket: str = Field(min_length=1, max_length=100)
    s3_key: str = Field(min_length=1, max_length=500)
    file_size_bytes: int = Field(gt=0)
    preview_s3_key: str | None = None
    price_per_sqkm: Decimal = Field(ge=0)
    extra_metadata: dict | None = None


class DatasetSearchQuery(BaseModel):
    """Schema for searching datasets."""

    location_id: uuid.UUID | None = None
    dataset_type: DatasetType | None = None
    bbox_wkt: str | None = Field(
        None, description="Search by bounding box: 'POLYGON((...))')"
    )
    limit: int = Field(50, ge=1, le=100)
    offset: int = Field(0, ge=0)


class DatasetStats(BaseModel):
    """Dataset statistics."""

    total_datasets: int
    datasets_by_type: dict[DatasetType, int]
    datasets_by_location: dict[str, int]
    total_size_bytes: int
