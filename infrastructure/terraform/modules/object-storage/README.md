# Module: object-storage

**Status: placeholder — not implemented.**

## Purpose

Will provision the production equivalent of the local MinIO service —
private S3-compatible buckets for source datasets, previews, order
output, and temporary/staging data. See
[decisions/0003-object-storage.md](../../../docs/decisions/0003-object-storage.md).

## Planned Resources

- Four buckets: source data, preview data, order output, temporary data
  (mirroring `geosphere-source-data`, `geosphere-preview-data`,
  `geosphere-order-output`, `geosphere-temporary-data`)
- Bucket policies denying all public/anonymous access
- Server-side encryption at rest
- Lifecycle rule on the temporary-data bucket to auto-expire stale
  objects
- An IAM role/policy (coordinated with the `security` module) scoped to
  exactly these buckets, assumed by `application` compute — never a
  long-lived static credential embedded anywhere

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |
| `bucket_name_prefix` | string | Prefix applied to all bucket names |
| `temporary_data_expiry_days` | number | Lifecycle expiry for the temp bucket |

## Outputs (planned)

| Name | Description |
|---|---|
| `source_data_bucket_name` | Name of the source-data bucket |
| `preview_data_bucket_name` | Name of the preview-data bucket |
| `order_output_bucket_name` | Name of the order-output bucket |
| `temporary_data_bucket_name` | Name of the temporary-data bucket |
