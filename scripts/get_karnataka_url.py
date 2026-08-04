#!/usr/bin/env python3
"""
Generate a presigned download URL for Karnataka State.kmz from MinIO.
This is a standalone script for testing/development.
"""
import boto3
from botocore.client import Config

# Remote MinIO configuration
MINIO_ENDPOINT = "192.168.10.81:9010"
MINIO_ACCESS_KEY = "geosphere_storage"
MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70"
S3_REGION = "geosphere"
S3_BUCKET = "geosphere-source-data"
S3_KEY = "india/karnataka/state-boundary/State.kmz"

# Create S3 client
s3_client = boto3.client(
    's3',
    endpoint_url=f"http://{MINIO_ENDPOINT}",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name=S3_REGION,
)

# Generate presigned URL (valid for 1 hour)
try:
    presigned_url = s3_client.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': S3_BUCKET,
            'Key': S3_KEY,
        },
        ExpiresIn=3600  # 1 hour
    )
    
    print("✅ Successfully generated presigned URL for Karnataka State.kmz")
    print(f"\nURL:\n{presigned_url}")
    print("\nThis URL is valid for 1 hour.")
    
except Exception as e:
    print(f"❌ Error generating presigned URL: {e}")
    exit(1)
