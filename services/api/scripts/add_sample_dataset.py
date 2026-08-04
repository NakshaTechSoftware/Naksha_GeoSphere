"""Add a sample dataset for Bengaluru, Karnataka.

This demonstrates how to add dataset metadata that points to a file in S3/MinIO.

Run with:
    docker exec naksha_geosphere-api-1 python scripts/add_sample_dataset.py
"""

import asyncio
import sys
from decimal import Decimal
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.database.session import get_session_factory
from app.modules.datasets.models import Dataset, DatasetStatus, DatasetType
from app.modules.datasets.repository import DatasetRepository
from app.modules.locations.models import Location


async def add_sample_dataset():
    """Add a sample satellite imagery dataset for Bengaluru."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        # Get Bengaluru Urban location
        result = await session.execute(
            select(Location).where(Location.code == "IN-KA-BLR")
        )
        bengaluru = result.scalar_one_or_none()

        if not bengaluru:
            print("✗ Bengaluru location not found! Run seed_locations.py first.")
            return

        print(f"✓ Found location: {bengaluru.name} ({bengaluru.code})")

        # Check if sample dataset already exists
        result = await session.execute(
            select(Dataset).where(Dataset.s3_key == "india/karnataka/raster/bengaluru_sample_sentinel2_2024.tif")
        )
        if result.scalar_one_or_none():
            print("✓ Sample dataset already exists!")
            return

        # Create sample dataset
        repo = DatasetRepository(session)

        # Bengaluru bounding box (approximate)
        # Format: POLYGON((lon1 lat1, lon2 lat2, lon3 lat3, lon4 lat4, lon1 lat1))
        bengaluru_bbox = (
            "POLYGON(("
            "77.45 12.85, "  # Southwest corner
            "77.80 12.85, "  # Southeast corner
            "77.80 13.15, "  # Northeast corner
            "77.45 13.15, "  # Northwest corner
            "77.45 12.85"    # Close polygon
            "))"
        )

        dataset = repo.create(
            name="Bengaluru Sentinel-2 Satellite Imagery 2024",
            description=(
                "High-resolution multispectral satellite imagery of Bengaluru Urban district "
                "captured by Sentinel-2 satellite. Includes RGB and NIR bands for vegetation "
                "analysis, urban planning, and land use classification."
            ),
            dataset_type=DatasetType.RASTER,
            location_id=bengaluru.id,
            bounding_box_wkt=bengaluru_bbox,
            file_format="GeoTIFF",
            coordinate_system="EPSG:4326",
            resolution_meters=Decimal("10.0"),  # 10 meter resolution
            s3_bucket="geosphere-source-data",
            s3_key="india/karnataka/raster/bengaluru_sample_sentinel2_2024.tif",
            file_size_bytes=524288000,  # 500 MB (sample size)
            preview_s3_key="india/karnataka/preview/bengaluru_sample_sentinel2_2024_preview.jpg",
            price_per_sqkm=Decimal("50.00"),  # ₹50 per sq km
            extra_metadata={
                "capture_date": "2024-01-15",
                "satellite": "Sentinel-2A",
                "cloud_cover_percentage": 5.2,
                "bands": ["B02 (Blue)", "B03 (Green)", "B04 (Red)", "B08 (NIR)"],
                "processing_level": "L2A",
                "source": "European Space Agency (ESA)",
                "license": "Copernicus Sentinel Data",
                "area_sqkm": 741,  # Bengaluru Urban area
            }
        )

        # Mark as available
        await repo.update_status(dataset, DatasetStatus.AVAILABLE)

        await session.commit()

        print(f"\n✓ Successfully created sample dataset!")
        print(f"  ID: {dataset.id}")
        print(f"  Name: {dataset.name}")
        print(f"  Type: {dataset.dataset_type.value}")
        print(f"  Location: {bengaluru.name}")
        print(f"  File: {dataset.s3_key}")
        print(f"  Size: {dataset.file_size_bytes / 1024 / 1024:.2f} MB")
        print(f"  Resolution: {dataset.resolution_meters}m")
        print(f"  Price: ₹{dataset.price_per_sqkm}/sq km")
        print(f"  Status: {dataset.status.value}")

        # Calculate example pricing
        area_sqkm = dataset.extra_metadata.get("area_sqkm", 0)
        if area_sqkm:
            total_price = float(dataset.price_per_sqkm) * area_sqkm
            print(f"\n  Example: Full Bengaluru coverage (~{area_sqkm} sq km) = ₹{total_price:,.2f}")


async def main():
    try:
        await add_sample_dataset()
    except Exception as e:
        print(f"\n✗ Error adding sample dataset: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
