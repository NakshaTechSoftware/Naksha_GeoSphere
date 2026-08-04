import asyncio
import aioboto3
from app.core.config import get_settings

async def check_structure():
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
        
        print(f"MinIO Structure in bucket: {bucket}\n")
        print("=" * 70)
        
        # List all objects
        response = await s3.list_objects_v2(Bucket=bucket, Delimiter='/')
        
        if 'CommonPrefixes' in response:
            for prefix in response['CommonPrefixes']:
                folder = prefix['Prefix']
                print(f"📁 {folder}")
                
                # Check india/ folder
                if folder == 'india/':
                    india_response = await s3.list_objects_v2(
                        Bucket=bucket, 
                        Prefix='india/',
                        Delimiter='/'
                    )
                    if 'CommonPrefixes' in india_response:
                        for sub_prefix in india_response['CommonPrefixes']:
                            sub_folder = sub_prefix['Prefix']
                            print(f"   📁 {sub_folder}")
                            
                            # Check karnataka/ folder
                            if 'karnataka' in sub_folder:
                                karnataka_response = await s3.list_objects_v2(
                                    Bucket=bucket,
                                    Prefix=sub_folder,
                                    Delimiter='/'
                                )
                                if 'CommonPrefixes' in karnataka_response:
                                    for kar_prefix in karnataka_response['CommonPrefixes']:
                                        kar_folder = kar_prefix['Prefix']
                                        print(f"      📁 {kar_folder}")
        
        # List all objects with full paths
        print(f"\n{'=' * 70}")
        print("All objects (files):\n")
        
        paginator = s3.get_paginator('list_objects_v2')
        async for page in paginator.paginate(Bucket=bucket):
            if 'Contents' in page:
                for obj in page['Contents']:
                    size_kb = obj['Size'] / 1024
                    if size_kb < 1:
                        size_str = f"{obj['Size']} bytes"
                    else:
                        size_str = f"{size_kb:.2f} KB"
                    print(f"  📄 {obj['Key']} ({size_str})")
        
        print(f"\n{'=' * 70}")
        print("✓ Structure created!")
        print("\nTo view in MinIO Console:")
        print("1. Open: http://localhost:9001")
        print("2. Navigate to: geosphere-source-data bucket")
        print("3. Click into folders: india/ → karnataka/ → raster/, vector/, etc.")

asyncio.run(check_structure())
