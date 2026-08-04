"""Upload Karnataka State Boundary files to MinIO."""

import boto3
from botocore.client import Config
from pathlib import Path

# Configuration
SOURCE_DIR = Path(r"E:\KSRSAC files\Karnataka State Boundary\KML Files")
MINIO_ENDPOINT = "http://localhost:9000"
ACCESS_KEY = "naksha_minio_b0KhJN58nGQ1H6sF3EsqPw"
SECRET_KEY = "2eKAxZ7G8LxJ4Mtcz7g12Q_minio_secret"
BUCKET = "geosphere-source-data"

print("=" * 70)
print("Karnataka State Boundary Upload to MinIO")
print("=" * 70)

# Check source directory
if not SOURCE_DIR.exists():
    print(f"\n✗ Directory not found: {SOURCE_DIR}")
    exit(1)

# Find KMZ/KML files
files = list(SOURCE_DIR.glob("*.kmz")) + list(SOURCE_DIR.glob("*.KMZ"))
files += list(SOURCE_DIR.glob("*.kml")) + list(SOURCE_DIR.glob("*.KML"))

if not files:
    print(f"\n✗ No KMZ/KML files found in: {SOURCE_DIR}")
    exit(1)

print(f"\nFound {len(files)} file(s) to upload:\n")
for f in files:
    size_kb = f.stat().st_size / 1024
    print(f"  - {f.name} ({size_kb:.2f} KB)")

# Create S3 client
s3_client = boto3.client(
    's3',
    endpoint_url=MINIO_ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name='geosphere',
)

print(f"\nUploading to bucket: {BUCKET}")
print("=" * 70)

for file_path in files:
    s3_key = f"india/karnataka/state-boundary/{file_path.name}"
    
    print(f"\n📤 Uploading: {file_path.name}")
    print(f"   Destination: {s3_key}")
    
    content_type = "application/vnd.google-earth.kmz" if file_path.suffix.lower() == ".kmz" else "application/vnd.google-earth.kml+xml"
    
    try:
        with open(file_path, 'rb') as file_data:
            s3_client.put_object(
                Bucket=BUCKET,
                Key=s3_key,
                Body=file_data,
                ContentType=content_type,
            )
        print("   ✓ Uploaded successfully!")
    except Exception as e:
        print(f"   ✗ Upload failed: {e}")

print(f"\n{'=' * 70}")
print("✓ Upload complete!")
print("\nView in MinIO Console:")
print("  1. Open: http://localhost:9001")
print("  2. Navigate to: geosphere-source-data")
print("  3. Path: india → karnataka → state-boundary\n")
