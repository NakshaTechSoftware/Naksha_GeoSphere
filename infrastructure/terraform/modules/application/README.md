# Module: application

**Status: placeholder — not implemented.**

## Purpose

Will provision the compute running the three application containers —
`web`, `api`, `worker` — mirroring their Docker Compose services, plus
the load balancer routing to `web`/`api`. Container images are expected
to come from a registry populated by `docker-ci.yml` (currently build-only,
no push — see [.github/workflows/docker-ci.yml](../../../.github/workflows/docker-ci.yml)).

## Planned Resources

- Container compute for `web`, `api`, `worker` (e.g. ECS/Fargate services
  or a provider equivalent), placed in `network`'s private subnets
- A load balancer / ingress in the public subnet, forwarding to `web`
  and `api`
- Task/service-level environment variable and secret wiring, pulling
  from the `security` module's secrets manager — never a literal value
  in this module
- Auto-scaling policy for `api`/`worker` based on CPU/queue depth

## Inputs (planned)

| Name | Type | Description |
|---|---|---|
| `environment` | string | `staging` \| `production` |
| `vpc_id`, `public_subnet_ids`, `private_subnet_ids`, `application_security_group_id` | — | From the `network` module |
| `database_endpoint` | string | From the `database` module |
| `queue_endpoint` | string | From the `queue` module |
| `object_storage_bucket_names` | map(string) | From the `object-storage` module |
| `secrets_arn_prefix` | string | From the `security` module |
| `web_image`, `api_image`, `worker_image` | string | Container image references (tag pinned, never `:latest`) |

## Outputs (planned)

| Name | Description |
|---|---|
| `load_balancer_url` | Public URL for the frontend/API |
