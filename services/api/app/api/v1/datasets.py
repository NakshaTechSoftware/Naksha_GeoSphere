"""API endpoints for datasets."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.database.session import get_session
from app.modules.datasets.models import DatasetStatus, DatasetType
from app.modules.datasets.repository import DatasetRepository
from app.modules.datasets.schemas import (
    DatasetCreate,
    DatasetPublic,
    DatasetSearchQuery,
    DatasetWithDownloadUrl,
)

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.get("/", response_model=list[DatasetPublic])
async def list_datasets(
    location_id: uuid.UUID | None = None,
    dataset_type: DatasetType | None = None,
    status_filter: DatasetStatus = DatasetStatus.AVAILABLE,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[DatasetPublic]:
    """List datasets with optional filters."""
    repo = DatasetRepository(session)
    
    if location_id:
        datasets = await repo.get_by_location(location_id, status_filter)
    elif dataset_type:
        datasets = await repo.get_by_type(dataset_type, status_filter, limit)
    else:
        datasets = await repo.get_available_datasets(limit, offset)
    
    return [DatasetPublic.model_validate(ds) for ds in datasets]


@router.get("/{dataset_id}", response_model=DatasetPublic)
async def get_dataset(
    dataset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DatasetPublic:
    """Get a dataset by ID."""
    repo = DatasetRepository(session)
    dataset = await repo.get_by_id(dataset_id)
    
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found"
        )
    
    return DatasetPublic.model_validate(dataset)


@router.post("/search", response_model=list[DatasetPublic])
async def search_datasets(
    query: DatasetSearchQuery,
    session: AsyncSession = Depends(get_session),
) -> list[DatasetPublic]:
    """Search datasets by location, type, or bounding box."""
    repo = DatasetRepository(session)
    
    if query.bbox_wkt:
        # Spatial search
        datasets = await repo.search_by_bbox(query.bbox_wkt, query.dataset_type)
    elif query.location_id:
        datasets = await repo.get_by_location(query.location_id, DatasetStatus.AVAILABLE)
    elif query.dataset_type:
        datasets = await repo.get_by_type(query.dataset_type, DatasetStatus.AVAILABLE, query.limit)
    else:
        datasets = await repo.get_available_datasets(query.limit, query.offset)
    
    return [DatasetPublic.model_validate(ds) for ds in datasets]


@router.post("/", response_model=DatasetPublic, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    dataset_data: DatasetCreate,
    session: AsyncSession = Depends(get_session),
) -> DatasetPublic:
    """Create a new dataset (admin only - add auth later)."""
    repo = DatasetRepository(session)
    
    # Verify location exists
    from app.modules.locations.repository import LocationRepository
    loc_repo = LocationRepository(session)
    location = await loc_repo.get_by_id(dataset_data.location_id)
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location {dataset_data.location_id} not found"
        )
    
    # Create dataset
    dataset = repo.create(
        name=dataset_data.name,
        description=dataset_data.description,
        dataset_type=dataset_data.dataset_type,
        location_id=dataset_data.location_id,
        bounding_box_wkt=dataset_data.bounding_box_wkt,
        file_format=dataset_data.file_format,
        coordinate_system=dataset_data.coordinate_system,
        resolution_meters=dataset_data.resolution_meters,
        s3_bucket=dataset_data.s3_bucket,
        s3_key=dataset_data.s3_key,
        file_size_bytes=dataset_data.file_size_bytes,
        preview_s3_key=dataset_data.preview_s3_key,
        price_per_sqkm=float(dataset_data.price_per_sqkm),
        extra_metadata=dataset_data.extra_metadata,
    )
    
    await session.commit()
    await session.refresh(dataset)
    
    return DatasetPublic.model_validate(dataset)


@router.get("/{dataset_id}/download", response_model=DatasetWithDownloadUrl)
async def get_dataset_download_url(
    dataset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> DatasetWithDownloadUrl:
    """Get a temporary signed download URL for a dataset.
    
    In production, this would require:
    - User authentication
    - Purchase verification
    - Payment confirmation
    
    For now, it generates a URL for any available dataset.
    """
    settings = get_settings()
    repo = DatasetRepository(session)
    
    dataset = await repo.get_by_id(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found"
        )
    
    if dataset.status != DatasetStatus.AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dataset is not available (status: {dataset.status.value})"
        )
    
    # Generate signed URL (simplified - in production use aioboto3)
    import boto3
    from botocore.client import Config
    
    s3_client = boto3.client(
        's3',
        endpoint_url=f"{'https' if settings.minio_use_ssl else 'http'}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=Config(signature_version='s3v4'),
        region_name=settings.s3_region,
    )
    
    try:
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': dataset.s3_bucket,
                'Key': dataset.s3_key,
            },
            ExpiresIn=settings.signed_url_expiry_seconds
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate download URL: {str(e)}"
        )
    
    expires_at = datetime.utcnow() + timedelta(seconds=settings.signed_url_expiry_seconds)
    
    # Convert dataset to dict and add download URL
    dataset_dict = DatasetPublic.model_validate(dataset).model_dump()
    dataset_dict['download_url'] = presigned_url
    dataset_dict['expires_at'] = expires_at
    
    return DatasetWithDownloadUrl(**dataset_dict)


@router.patch("/{dataset_id}/status", response_model=DatasetPublic)
async def update_dataset_status(
    dataset_id: uuid.UUID,
    new_status: DatasetStatus,
    session: AsyncSession = Depends(get_session),
) -> DatasetPublic:
    """Update dataset status (admin only - add auth later)."""
    repo = DatasetRepository(session)
    
    dataset = await repo.get_by_id(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found"
        )
    
    await repo.update_status(dataset, new_status)
    await session.commit()
    await session.refresh(dataset)
    
    return DatasetPublic.model_validate(dataset)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
):
    """Delete a dataset (admin only - add auth later).
    
    Note: This only deletes the metadata record, not the S3 file.
    """
    repo = DatasetRepository(session)
    
    dataset = await repo.get_by_id(dataset_id)
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset {dataset_id} not found"
        )
    
    await repo.delete(dataset)
    await session.commit()
