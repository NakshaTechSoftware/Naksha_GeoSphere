"""Setup S3/MinIO folder structure for India → Karnataka geospatial data.

Creates the following structure:
geosphere-source-data/
  india/
    karnataka/
      raster/
      vector/
      lidar/
      dem/

Run with:
    docker exec naksha_geosphere-api-1 python scripts/setup_storage_structure.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import aioboto3
from botocore.exceptions import ClientError

from app.core.config import get_settings


async def setup_storage_structure():
    """Create folder structure in S3/MinIO for India → Karnataka."""
    settings = get_settings()

    session = aioboto3.Session()

    async with session.client(
        "s3",
        endpoint_url=f"{'https' if settings.minio_use_ssl else 'http'}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=settings.s3_region,
    ) as s3:
        bucket = settings.s3_bucket_source_data

        # Check if bucket exists
        try:
            await s3.head_bucket(Bucket=bucket)
            print(f"✓ Bucket exists: {bucket}")
        except ClientError:
            print(f"✗ Bucket does not exist: {bucket}")
            print(f"  Create it first using MinIO console or initialization script")
            return

        # Create folder structure
        # Note: S3/MinIO doesn't have "folders" but uses key prefixes
        # We create empty objects with trailing slashes to simulate folders
        folders = [
            "india/",
            "india/karnataka/",
            "india/karnataka/raster/",
            "india/karnataka/vector/",
            "india/karnataka/lidar/",
            "india/karnataka/dem/",
            "india/karnataka/preview/",
        ]

        print(f"\nCreating folder structure in bucket: {bucket}")
        for folder in folders:
            try:
                # Put an empty object with key ending in /
                await s3.put_object(
                    Bucket=bucket,
                    Key=folder,
                    Body=b"",
                )
                print(f"  ✓ Created: {folder}")
            except ClientError as e:
                print(f"  ✗ Failed to create {folder}: {e}")

        print(f"\n✓ Storage structure setup complete!")
        print(f"\nFolder structure:")
        print(f"  {bucket}/")
        print(f"    india/")
        print(f"      karnataka/")
        print(f"        raster/     (GeoTIFF, satellite imagery)")
        print(f"        vector/     (Shapefile, GeoJSON)")
        print(f"        lidar/      (LAS, LAZ point clouds)")
        print(f"        dem/        (Digital Elevation Models)")
        print(f"        preview/    (Thumbnails, previews)")


async def main():
    try:
        await setup_storage_structure()
    except Exception as e:
        print(f"\n✗ Error setting up storage structure: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
