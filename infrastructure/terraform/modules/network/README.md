# Module: network

**Status: placeholder — not implemented.**

## Purpose

Will provision the private networking Naksha GeoSphere's production
compute, database, cache, and object storage run inside: a VPC (or
provider equivalent), private subnets for `application`/`database`/
`queue`, and security groups/firewall rules that mirror the isolation
`naksha-network` gives us locally in Docker Compose — the database,
Redis, and object storage should never be reachable from outside this
network, only from the `application` module's compute.

## Planned Resources

- VPC / virtual network
- Public subnet(s) for ingress (load balancer) only
- Private subnet(s) for application compute, database, cache
- Security groups / NSGs: `application` (accepts inbound from the load
  balancer only), `database` (accepts inbound from `application` only,
  on the Postgres port), `queue` (accepts inbound from `application` and
  `queue`-consuming compute only)
- NAT gateway (or provider equivalent) for private-subnet egress (pulling
  container images, calling external APIs)

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |
| `cidr_block` | string | Network CIDR range |
| `availability_zone_count` | number | Number of AZs to spread subnets across |

## Outputs (planned)

| Name | Description |
|---|---|
| `network_id` | ID of the created network |
| `private_subnet_ids` | Subnet IDs for application/database/queue |
| `public_subnet_ids` | Subnet IDs for ingress |
| `application_security_group_id` | Security group for `application` module compute |
| `database_security_group_id` | Security group for `database` module |
| `queue_security_group_id` | Security group for `queue` module |
