# 0003 — S3-Compatible Object Storage, MinIO for Local Development

## Status

Accepted

## Context

Datasets (source rasters/vectors, generated previews, clipped order
output) are large binary objects that don't belong in the relational
database. We need object storage that: works fully offline for local
development, has a well-understood private-by-default access model, and
maps cleanly onto whatever a team chooses in production (most
commonly AWS S3 or an S3-compatible alternative).

## Decision

All object access in the API goes through a single abstraction
(`app/services/storage_client.py`) built on `boto3`'s S3 client, pointed
at MinIO locally via `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/
`MINIO_SECRET_KEY`. Because MinIO implements the S3 API, the exact same
client code should work against real S3 (or another S3-compatible
provider) in production by changing configuration only — no
provider-specific code path.

Four buckets are created (idempotently, by `minio-init`) and kept
private: `geosphere-source-data`, `geosphere-preview-data`,
`geosphere-order-output`, `geosphere-temporary-data`. No bucket is ever
made public; downloads are intended to go through short-lived signed
URLs once that flow is implemented (see
[SECURITY.md](../SECURITY.md)).

## Consequences

- Local development needs no cloud account or network access for object
  storage.
- Production is not locked into MinIO — any S3-compatible managed
  service works.
- The single-client-abstraction rule means any future module needing
  object access reuses `get_s3_client()` rather than instantiating its
  own client with its own credential-handling — one place to get storage
  security right.
