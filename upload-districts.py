#!/usr/bin/env python3
"""
Upload Karnataka district subfolders to MinIO
Skips 17_Chikkamagaluru which is already uploaded
"""

import os
import sys
from pathlib import Path
import boto3
from botocore.client import Config

# Configuration
SOURCE_DIR = r"E:\Datasets routes\KGIS_District_SubDistrict_Combined"
MINIO_ENDPOINT = "192.168.10.81:9010"
MINIO_ACCESS_KEY = "geosphere_storage"
MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70"
BUCKET_NAME = "geosphere-source-data"
TARGET_PREFIX = "india/karnataka"
SKIP_FOLDER = "17_Chikkamagaluru"

def upload_folder_to_minio(s3_client, local_folder, bucket, s3_prefix):
    """Upload all files in a folder to MinIO recursively"""
    uploaded_files = []
    errors = []
    
    local_path = Path(local_folder)
    
    for file_path in local_path.rglob('*'):
        if file_path.is_file():
            # Calculate relative path
            relative_path = file_path.relative_to(local_path)
            s3_key = f"{s3_prefix}/{relative_path}".replace('\\', '/')
            
            try:
                print(f"    Uploading: {relative_path}")
                s3_client.upload_file(
                    str(file_path),
                    bucket,
                    s3_key
                )
                uploaded_files.append(str(relative_path))
            except Exception as e:
                error_msg = f"Error uploading {relative_path}: {str(e)}"
                print(f"    ✗ {error_msg}")
                errors.append(error_msg)
    
    return uploaded_files, errors

def main():
    print("=" * 60)
    print("Karnataka Districts Upload to MinIO")
    print("=" * 60)
    print(f"Source: {SOURCE_DIR}")
    print(f"Target: s3://{BUCKET_NAME}/{TARGET_PREFIX}")
    print(f"Skipping: {SKIP_FOLDER}")
    print()
    
    # Check if source directory exists
    if not os.path.exists(SOURCE_DIR):
        print(f"ERROR: Source directory not found: {SOURCE_DIR}")
        sys.exit(1)
    
    # Initialize S3 client for MinIO
    try:
        s3_client = boto3.client(
            's3',
            endpoint_url=f'http://{MINIO_ENDPOINT}',
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='geosphere'
        )
        print("✓ Connected to MinIO")
        print()
    except Exception as e:
        print(f"ERROR: Failed to connect to MinIO: {e}")
        sys.exit(1)
    
    # Get all district folders
    source_path = Path(SOURCE_DIR)
    all_folders = [f for f in source_path.iterdir() if f.is_dir() and f.name[0].isdigit()]
    all_folders.sort()
    
    total_folders = len(all_folders)
    uploaded_count = 0
    skipped_count = 0
    error_count = 0
    total_files_uploaded = 0
    
    print(f"Found {total_folders} district folders")
    print()
    
    for idx, folder in enumerate(all_folders, 1):
        folder_name = folder.name
        
        # Skip already uploaded folder
        if folder_name == SKIP_FOLDER:
            print(f"[{idx}/{total_folders}] SKIPPING: {folder_name} (already uploaded)")
            skipped_count += 1
            continue
        
        print(f"[{idx}/{total_folders}] Uploading: {folder_name}")
        
        try:
            s3_prefix = f"{TARGET_PREFIX}/{folder_name}"
            uploaded_files, errors = upload_folder_to_minio(
                s3_client,
                folder,
                BUCKET_NAME,
                s3_prefix
            )
            
            if errors:
                print(f"  ⚠ Uploaded {len(uploaded_files)} files with {len(errors)} errors")
                error_count += 1
            else:
                print(f"  ✓ Successfully uploaded {len(uploaded_files)} files")
                uploaded_count += 1
            
            total_files_uploaded += len(uploaded_files)
            
        except Exception as e:
            print(f"  ✗ Error uploading {folder_name}: {e}")
            error_count += 1
        
        print()
    
    # Summary
    print("=" * 60)
    print("Upload Complete!")
    print("=" * 60)
    print(f"Total folders:      {total_folders}")
    print(f"Uploaded:           {uploaded_count} folders ({total_files_uploaded} files)")
    print(f"Skipped:            {skipped_count}")
    print(f"Errors:             {error_count}")
    print("=" * 60)

if __name__ == "__main__":
    main()
