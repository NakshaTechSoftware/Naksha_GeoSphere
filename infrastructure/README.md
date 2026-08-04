# infrastructure/

This directory holds everything needed to run Naksha GeoSphere outside a
developer's laptop: local Docker support files, and a documented — but
**unprovisioned** — Terraform scaffold for a future real cloud
deployment.

## docker/

- `minio-init/create-buckets.sh` — idempotent bucket creation used by the
  `minio-init` service in `compose.local-storage.yaml`.
- `data/` — gitignored local scratch directory created by the bootstrap
  scripts; not used by the current named-volume-based Compose setup, but
  available if a developer wants to bind-mount data for inspection.

## storage-server/

A **separate, self-contained deployment package** — not run by this
machine's own Compose files. It runs PostgreSQL/PostGIS, Redis, and
object storage on a dedicated machine on the LAN, so the main
application (`web`/`api`/`worker`) can run on this machine in **remote
storage mode** instead of running those services locally. See
[storage-server/README.md](storage-server/README.md) for deployment
instructions and [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for how
the two storage topologies compare.

## terraform/

A **scaffold only**. No `terraform apply` has been run against this
repository, no provider credentials or cloud account identifiers are
present anywhere in it, and no real cloud resources exist yet.

```
terraform/
  modules/
    network/          VPC/subnets/security groups (placeholder)
    database/          Managed PostgreSQL+PostGIS (placeholder)
    object-storage/     Managed S3-compatible storage (placeholder)
    application/        API/worker/web compute (placeholder)
    queue/               Managed Redis (placeholder)
    monitoring/          Logs/metrics/alarms (placeholder)
    security/             IAM/secrets manager wiring (placeholder)
  environments/
    development/
    staging/
    production/
```

Each module has its own `README.md` describing what it will eventually
provision and why. Each environment directory has its own `README.md`
describing how the modules will be composed for that environment.

### Why this exists now, unprovisioned

The non-negotiable rule for this phase is "document, don't provision."
Standing up the module *shape* now means:

- Future cloud work has an agreed structure instead of starting from a
  blank directory.
- The module boundaries mirror the Docker Compose services
  (`network` ~ the Compose network, `database` ~ `postgres`,
  `object-storage` ~ `minio`, `queue` ~ `redis`, `application` ~
  `web`/`api`/`worker`), so the mental model transfers directly.
- Nothing here can accidentally provision or cost anything, because
  there is nothing runnable in it yet — no backend configured, no
  provider credentials, no resources defined.

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for what actually
changes when this scaffold is eventually filled in.
