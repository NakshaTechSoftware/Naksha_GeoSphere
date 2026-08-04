# Module: queue

**Status: placeholder — not implemented.**

## Purpose

Will provision a managed Redis instance, mirroring the `redis` service
in Docker Compose — used as the Celery broker/result backend for
`application` (API + worker) compute. Must land in `network`'s private
subnets, reachable only from `application` compute.

## Planned Resources

- Managed Redis instance (single-node for staging, replicated for
  production)
- Encryption in transit and at rest
- Subnet group placing the instance in `network`'s private subnets

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |
| `subnet_ids` | list(string) | Private subnet IDs from the `network` module |
| `security_group_id` | string | Queue security group ID from the `network` module |
| `node_type` | string | Provider-specific instance size |

## Outputs (planned)

| Name | Description |
|---|---|
| `endpoint` | Connection host (no credentials) |
| `port` | Connection port |
