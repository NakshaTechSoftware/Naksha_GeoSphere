#!/bin/sh
# Idempotently creates the private MinIO buckets Naksha GeoSphere needs.
# Runs once as the `minio-init` container against a healthy `minio`
# service, then exits. Safe to re-run â€” `mc mb --ignore-existing` and
# `mc anonymous set none` are no-ops if already applied.
set -eu

echo "Waiting for MinIO to accept connections..."
mc alias set local "http://minio:9000" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"

for bucket in \
    "$S3_BUCKET_SOURCE_DATA" \
    "$S3_BUCKET_PREVIEW_DATA" \
    "$S3_BUCKET_ORDER_OUTPUT" \
    "$S3_BUCKET_TEMPORARY_DATA"; do
  echo "Ensuring bucket '$bucket' exists and is private..."
  mc mb --ignore-existing "local/$bucket"
  # Explicitly private â€” no anonymous/public read or write access, and no
  # public bucket policy of any kind.
  mc anonymous set none "local/$bucket"
done

echo "All required MinIO buckets are present and private."
