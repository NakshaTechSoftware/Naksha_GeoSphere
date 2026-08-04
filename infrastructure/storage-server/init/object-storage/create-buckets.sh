#!/bin/sh
# Naksha GeoSphere storage server — idempotent private bucket creation.
# Runs once against the healthy `minio` service on the internal
# storage-network, then exits 0. Safe to re-run.
set -eu

echo "Connecting to MinIO..."
mc alias set local "http://minio:9000" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"

for bucket in \
    "$S3_SOURCE_BUCKET" \
    "$S3_PREVIEW_BUCKET" \
    "$S3_ORDER_BUCKET" \
    "$S3_TEMPORARY_BUCKET"; do
  echo "Ensuring bucket '$bucket' exists and is private..."
  mc mb --ignore-existing "local/$bucket"
  mc anonymous set none "local/$bucket"
done

echo "Confirming all required buckets are present..."
for bucket in \
    "$S3_SOURCE_BUCKET" \
    "$S3_PREVIEW_BUCKET" \
    "$S3_ORDER_BUCKET" \
    "$S3_TEMPORARY_BUCKET"; do
  mc ls "local/$bucket" >/dev/null
done

echo "All required MinIO buckets are present and private. Exiting successfully."
exit 0
