import asyncio
import aioboto3
from app.core.config import get_settings

async def verify_and_fix():
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
        
        print(f"Checking bucket: {bucket}\n")
        
        # List all objects
        try:
            response = await s3.list_objects_v2(Bucket=bucket)
            
            if 'Contents' in response:
                print("✓ Existing objects:")
                for obj in response['Contents']:
                    print(f"  - {obj['Key']}")
            else:
                print("✗ No objects found")
            
            # Create README files in each folder so they're visible
            folders = [
                ("india/README.txt", "India geospatial data"),
                ("india/karnataka/README.txt", "Karnataka state geospatial data"),
                ("india/karnataka/raster/README.txt", "Raster datasets (GeoTIFF, satellite imagery)"),
                ("india/karnataka/vector/README.txt", "Vector datasets (Shapefile, GeoJSON)"),
                ("india/karnataka/lidar/README.txt", "LiDAR point clouds (LAS, LAZ)"),
                ("india/karnataka/dem/README.txt", "Digital Elevation Models"),
                ("india/karnataka/preview/README.txt", "Preview images and thumbnails"),
            ]
            
            print("\n✓ Creating marker files...")
            for key, content in folders:
                await s3.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=content.encode('utf-8'),
                    ContentType='text/plain'
                )
                print(f"  ✓ Created: {key}")
            
            print("\n✓ Done! Now you can see the folder structure in MinIO Console")
            print("  Refresh the browser to see: india/karnataka/raster, vector, lidar, dem, preview")
            
        except Exception as e:
            print(f"✗ Error: {e}")

asyncio.run(verify_and_fix())
