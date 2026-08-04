"""Upload Karnataka State Boundary KMZ files to MinIO."""

import asyncio
import os
from pathlib import Path
import aioboto3
from app.core.config import get_settings

async def upload_files():
    settings = get_settings()
    
    # Source directory
    source_dir = Path(r"E:\KSRSAC files\Karnataka State Boundary\KML Files")
    
    if not source_dir.exists():
        print(f"✗ Directory not found: {source_dir}")
        return
    
    # Find all KMZ and KML files
    kmz_files = list(source_dir.glob("*.kmz")) + list(source_dir.glob("*.KMZ"))
    kml_files = list(source_dir.glob("*.kml")) + list(source_dir.glob("*.KML"))
    all_files = kmz_files + kml_files
    
    if not all_files:
        print(f"✗ No KMZ/KML files found in: {source_dir}")
        return
    
    print(f"Found {len(all_files)} file(s) to upload:\n")
    for f in all_files:
        print(f"  - {f.name} ({f.stat().st_size / 1024:.2f} KB)")
    
    session = aioboto3.Session()
    
    async with session.client(
        "s3",
        endpoint_url=f"{'https' if settings.minio_use_ssl else 'http'}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=settings.s3_region,
    ) as s3:
        bucket = settings.s3_bucket_source_data
        
        print(f"\nUploading to bucket: {bucket}")
        print("=" * 70)
        
        for file_path in all_files:
            # Create S3 key with hierarchy: india/karnataka/state-boundary/filename.kmz
            s3_key = f"india/karnataka/state-boundary/{file_path.name}"
            
            print(f"\n📤 Uploading: {file_path.name}")
            print(f"   Destination: {s3_key}")
            
            try:
                with open(file_path, 'rb') as file_data:
                    await s3.put_object(
                        Bucket=bucket,
                        Key=s3_key,
                        Body=file_data,
                        ContentType='application/vnd.google-earth.kmz' if file_path.suffix.lower() == '.kmz' else 'application/vnd.google-earth.kml+xml',
                    )
                
                print(f"   ✓ Uploaded successfully!")
                
            except Exception as e:
                print(f"   ✗ Upload failed: {e}")
        
        print(f"\n{'=' * 70}")
        print("✓ Upload complete!")
        print("\nRefresh MinIO Console to see:")
        print("  geosphere-source-data → india → karnataka → state-boundary")

asyncio.run(upload_files())
