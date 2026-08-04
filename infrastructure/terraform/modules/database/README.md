# Module: database

**Status: placeholder — not implemented.**

## Purpose

Will provision a managed PostgreSQL instance with PostGIS support,
mirroring the `postgres` service in Docker Compose
(`postgis/postgis:16-3.4`). Must land in the private subnets from the
`network` module, reachable only from `application` module compute.

## Planned Resources

- Managed PostgreSQL instance (version matching or exceeding 16) with
  the PostGIS extension enabled and available
- Automated backups with a defined retention window
- A dedicated application database user (least-privilege — not the
  instance superuser) whose credentials are written to the `security`
  module's secrets manager, never to Terraform state or output as plain
  text
- Subnet group placing the instance in `network`'s private subnets

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |
| `subnet_ids` | list(string) | Private subnet IDs from the `network` module |
| `security_group_id` | string | Database security group ID from the `network` module |
| `instance_class` | string | Provider-specific instance size |
| `allocated_storage_gb` | number | Initial storage allocation |
| `backup_retention_days` | number | Automated backup retention |

## Outputs (planned)

| Name | Description |
|---|---|
| `endpoint` | Connection host (no credentials) |
| `port` | Connection port |
| `database_name` | Application database name |

Credentials are never a Terraform output — they are generated and stored
directly in the `security` module's secrets manager integration.
