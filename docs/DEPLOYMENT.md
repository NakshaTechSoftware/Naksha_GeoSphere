# Deployment

This foundation is built for local Docker Compose development. This
document covers what changes for production and what is intentionally
**not** provisioned yet.

## Production Compose Overlay

Production runs in one of two storage topologies (see
[Storage Topologies](#storage-topologies) below):

```bash
# Storage co-located on this machine
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.prod.yaml up --build -d

# Storage on a separate machine (see infrastructure/storage-server/)
docker compose -f compose.yaml -f compose.prod.yaml -f compose.remote-storage.yaml up --build -d
```

Compared to `compose.dev.yaml`:

- No source bind-mounts — images are fully self-contained, built from
  each service's `runner` Dockerfile target.
- No `--reload` on the API, no `pnpm dev` on the frontend — production
  commands only.
- When storage is co-located (`compose.local-storage.yaml`), PostgreSQL,
  Redis, and MinIO publish **no host ports** — reachable only from other
  containers on `naksha-network`. In remote-storage mode they don't run
  on this machine at all.
- Mailpit is not included at all (see below).
- `API_DOCS_ENABLED` is forced off.
- `NEXT_PUBLIC_API_URL` has no default — it must be explicitly set to a
  real, browser-reachable API URL.
- CPU/memory limits and reservations are set per service.

## Storage Topologies

This foundation supports two storage topologies, chosen by which Compose
overlay you combine with `compose.yaml`:

1. **Local storage** (`compose.local-storage.yaml`) — PostgreSQL, Redis,
   and MinIO run as containers alongside `web`/`api`/`worker` on the same
   machine. Simplest to operate; suits a single-box deployment.
2. **Remote storage** (`compose.remote-storage.yaml`) — PostgreSQL,
   Redis, and object storage run on a **separate machine** (see
   [infrastructure/storage-server/](../infrastructure/storage-server/)),
   reachable over the LAN/private network. This machine then runs only
   `web`, `api`, `worker`, and (in dev) `mailpit`. This is the
   recommended direction for anything beyond a single-box setup — it
   lets storage be backed up, sized, and hardened independently of
   application compute, and matches how a managed-database production
   setup will eventually look (see
   [Recommended Production Object Storage](#recommended-production-object-storage)
   and the database equivalent).

Never combine `compose.local-storage.yaml` and
`compose.remote-storage.yaml` in the same `docker compose -f ...`
invocation.

## Non-root Containers

Every application image (`web`, `api`, `worker`) creates and runs as a
dedicated non-root user in its `runner`/production stage. Base
infrastructure images (Postgres, Redis, MinIO) already follow this
practice upstream.

## What This Foundation Does NOT Provision

- **A real cloud environment.** `infrastructure/terraform/` is a
  documented scaffold only — no provider credentials, no state backend,
  no `terraform apply` has been run. See
  [infrastructure/README.md](../infrastructure/README.md).
- **A reverse proxy / TLS termination.** Add one (e.g. a managed load
  balancer, or nginx/Caddy) in front of `web` and `api` before exposing
  this to the internet.
- **A production mail provider.** Mailpit is local-only. Point
  `MAIL_HOST`/`MAIL_PORT` at a real transactional email provider (and add
  authentication) when that need arrives.
- **Kubernetes or additional microservices.** Out of scope by design —
  see [decisions/0001-modular-monolith.md](decisions/0001-modular-monolith.md).
- **Payment, auth, or marketplace logic.** Not implemented yet.

## Recommended Production Object Storage

MinIO is a local-development convenience. In production, point the same
S3-compatible client abstraction (`app/services/storage_client.py`) at a
managed, private S3-compatible provider (e.g. AWS S3, or a managed MinIO
deployment) via `MINIO_ENDPOINT`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` (or
their cloud-provider equivalents through a secrets manager — never
committed values). Buckets must remain private; only short-lived signed
URLs should ever leave the API.

## Secrets in Production

Never put real secrets in a `.env` file shipped with a deployment. Use
your platform's secret manager (e.g. AWS Secrets Manager, GCP Secret
Manager, Doppler, Vault) and inject them as environment variables at
container-start time. `docs/SECURITY.md` covers this in more detail.

## Database Migrations in Production

Run `alembic upgrade head` as an explicit, separate deployment step
(e.g. a one-off task/job) before rolling out a new API version — never
automatically on API container start, to avoid concurrent migration
races during a multi-replica rollout.

## Suggested Next Steps Toward Real Cloud Deployment

1. Pick a target (ECS/Fargate, a managed Kubernetes-free container
   platform, or a PaaS) and fill in the corresponding Terraform module
   under `infrastructure/terraform/modules/`.
2. Stand up managed Postgres (with PostGIS) and a managed Redis.
3. Move object storage to a managed, private S3-compatible bucket.
4. Add a reverse proxy/CDN in front of `web`.
5. Wire `docker-ci.yml` up to also push images to a registry, and add a
   deployment workflow — intentionally not included in this phase.
