"""Data access for datasets table."""

from __future__ import annotations

import uuid

from geoalchemy2.functions import ST_Intersects, ST_GeomFromText
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.datasets.models import Dataset, DatasetStatus, DatasetType


class DatasetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, dataset_id: uuid.UUID) -> Dataset | None:
        """Get dataset by ID with location loaded."""
        result = await self._session.execute(
            select(Dataset)
            .where(Dataset.id == dataset_id)
            .options(selectinload(Dataset.location))
        )
        return result.scalar_one_or_none()

    async def get_by_location(
        self, location_id: uuid.UUID, status: DatasetStatus | None = None
    ) -> list[Dataset]:
        """Get all datasets for a location."""
        query = select(Dataset).where(Dataset.location_id == location_id)
        if status:
            query = query.where(Dataset.status == status)
        query = query.order_by(Dataset.created_at.desc())

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def get_by_type(
        self,
        dataset_type: DatasetType,
        status: DatasetStatus | None = None,
        limit: int = 50,
    ) -> list[Dataset]:
        """Get datasets by type."""
        query = select(Dataset).where(Dataset.dataset_type == dataset_type)
        if status:
            query = query.where(Dataset.status == status)
        query = query.order_by(Dataset.created_at.desc()).limit(limit)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def search_by_bbox(
        self, bbox_wkt: str, dataset_type: DatasetType | None = None
    ) -> list[Dataset]:
        """Search datasets that intersect with a bounding box (WKT format).

        Example bbox_wkt: 'POLYGON((77.5 12.9, 77.7 12.9, 77.7 13.1, 77.5 13.1, 77.5 12.9))'
        """
        query = select(Dataset).where(
            ST_Intersects(Dataset.bounding_box, ST_GeomFromText(bbox_wkt, 4326))
        )
        if dataset_type:
            query = query.where(Dataset.dataset_type == dataset_type)
        query = query.where(Dataset.status == DatasetStatus.AVAILABLE)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def get_available_datasets(
        self, limit: int = 50, offset: int = 0
    ) -> list[Dataset]:
        """Get all available datasets with pagination."""
        result = await self._session.execute(
            select(Dataset)
            .where(Dataset.status == DatasetStatus.AVAILABLE)
            .order_by(Dataset.created_at.desc())
            .limit(limit)
            .offset(offset)
            .options(selectinload(Dataset.location))
        )
        return list(result.scalars().all())

    def create(
        self,
        *,
        name: str,
        description: str | None,
        dataset_type: DatasetType,
        location_id: uuid.UUID,
        bounding_box_wkt: str,
        file_format: str,
        coordinate_system: str,
        s3_bucket: str,
        s3_key: str,
        file_size_bytes: int,
        price_per_sqkm: float,
        resolution_meters: float | None = None,
        preview_s3_key: str | None = None,
        extra_metadata: dict | None = None,
    ) -> Dataset:
        """Create a new dataset record.

        Note: bounding_box_wkt should be in WKT format:
        'POLYGON((lon1 lat1, lon2 lat2, lon3 lat3, lon4 lat4, lon1 lat1))'
        """
        dataset = Dataset(
            name=name,
            description=description,
            dataset_type=dataset_type,
            status=DatasetStatus.DRAFT,
            location_id=location_id,
            bounding_box=bounding_box_wkt,
            file_format=file_format,
            coordinate_system=coordinate_system,
            resolution_meters=resolution_meters,
            s3_bucket=s3_bucket,
            s3_key=s3_key,
            file_size_bytes=file_size_bytes,
            preview_s3_key=preview_s3_key,
            price_per_sqkm=price_per_sqkm,
            extra_metadata=extra_metadata,
        )
        self._session.add(dataset)
        return dataset

    async def update_status(self, dataset: Dataset, status: DatasetStatus) -> None:
        """Update dataset status."""
        dataset.status = status
        await self._session.flush()

    async def delete(self, dataset: Dataset) -> None:
        """Delete a dataset record (does not delete S3 file)."""
        await self._session.delete(dataset)
