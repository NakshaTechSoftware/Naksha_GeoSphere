# Naksha GeoSphere — The Geospatial Data Marketplace

> **Status: Engineering Foundation (Phase 0).** This repository currently
> contains a production-oriented *platform foundation* — not the marketplace
> itself. No purchasing, payments, authentication, or dataset-fulfillment
> logic is implemented yet. See [Future Development Phases](#17-future-development-phases).

## 1. Project Overview

Naksha GeoSphere is a premium geospatial data marketplace where users will be
able to search a location, explore available raster/vector datasets, preview
them on an interactive map, select an Area of Interest (AOI), see a
calculated price, purchase the dataset, and receive a securely clipped and
packaged download.

This repository is the **foundation** that the full product will be built
on: a working local development environment, a modular-monolith API, a
background geospatial worker, object storage, CI/CD, and documentation —
all wired together and validated end-to-end.

## 2. Current Scope

**In scope (this phase):**

- Monorepo layout (frontend, API, worker, shared packages, infrastructure)
- Local Docker Compose stack (Postgres/PostGIS, Redis, MinIO, Mailpit)
- Optional remote storage mode: Postgres/Redis/object storage can run on a
  separate LAN machine instead (see
  [infrastructure/storage-server/](infrastructure/storage-server/))
- FastAPI skeleton with liveness/readiness/aggregated health endpoints
- Celery worker skeleton with example tasks and dedicated queues
- Alembic migration enabling PostGIS + pgcrypto
- Next.js starter page with branding, service-status cards, and a MapLibre
  placeholder
- Linting, type checking, unit tests, CI workflows
- Documentation: architecture, security, geospatial standards, deployment

**Explicitly out of scope (future phases):** authentication, authorization,
payments, dataset catalog, AOI selection/pricing, order fulfillment,
clipping/conversion pipelines, licensing, notifications.

## 3. Architecture Summary

```
                 ┌──────────────┐        ┌──────────────────┐
   Browser ───▶  │  apps/web    │──────▶ │  services/api    │
                 │  (Next.js)   │  REST  │  (FastAPI)       │
                 └──────────────┘        └───────┬──────────┘
                                                  │
                        ┌─────────────────────────┼─────────────────────┐
                        ▼                         ▼                     ▼
                ┌───────────────┐        ┌────────────────┐   ┌──────────────────┐
                │ PostgreSQL /  │        │     Redis       │   │  services/worker  │
                │   PostGIS     │◀──────▶│ (broker/cache)  │◀─▶│    (Celery)       │
                └───────────────┘        └────────────────┘   └─────────┬─────────┘
                                                                          ▼
                                                                  ┌───────────────┐
                                                                  │ MinIO / S3     │
                                                                  │ object storage │
                                                                  └───────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown,
data flow, and future AOI-purchase / secure-download flows.

## 4. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript, pnpm, Tailwind CSS, Vitest, React Testing Library, Playwright (scaffold), MapLibre GL JS |
| Backend | Python, FastAPI, Pydantic, Pydantic Settings, SQLAlchemy 2.x (async), asyncpg, Alembic, Ruff, MyPy, Pytest |
| Worker | Celery, Redis, GDAL, Rasterio, GeoPandas, Shapely, PyProj, Fiona |
| Database | PostgreSQL + PostGIS + pgcrypto |
| Object storage | MinIO (dev) / S3-compatible (prod) |
| Mail testing | Mailpit |
| Containers | Docker, Docker Compose, multi-stage Dockerfiles |
| CI/CD | GitHub Actions |

Pinned versions are listed in [SETUP_REPORT.md](SETUP_REPORT.md).

## 5. Prerequisites

- Docker Desktop (with Docker Compose v2) — **the only hard requirement**
- Git
- Node.js ≥ 20 (only needed if you want to run frontend tooling *outside*
  Docker)
- Python ≥ 3.12 (only needed to run backend tooling *outside* Docker)

You do **not** need PostgreSQL, Redis, or MinIO installed locally — they run
entirely inside Docker.

## 6. Windows PowerShell Setup

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d
```

## 7. Linux/macOS Setup

```bash
chmod +x ./scripts/bootstrap.sh
./scripts/bootstrap.sh
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d
```

## 8. Docker Startup

```bash
# Start everything (development profile: hot reload, source mounts)
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d

# Tail logs
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml logs -f

# Stop everything
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml down
```

## 9. Storage Modes: Local vs Remote

By default this machine runs **everything**, including PostgreSQL,
Redis, and object storage, in Docker alongside the app (**local
storage mode** — the commands above).

For a more production-like topology, PostgreSQL/Redis/object storage
can instead run on a **separate machine on the LAN** (see
[infrastructure/storage-server/](infrastructure/storage-server/)), with
this machine running only `web`, `api`, `worker`, and `mailpit`
(**remote storage mode**):

```bash
docker compose -f compose.yaml -f compose.dev.yaml -f compose.remote-storage.yaml up --build -d
```

This requires the variables in
[.env.remote-storage.example](.env.remote-storage.example) to be merged
into your `.env`, matching the storage server's own `.env.storage`
exactly. **Never combine `compose.local-storage.yaml` and
`compose.remote-storage.yaml` in the same command** — pick one mode.

| Mode | Files | What runs here |
|---|---|---|
| Local storage (default) | `compose.yaml` + `compose.local-storage.yaml` + `compose.local-storage.dev.yaml` + `compose.dev.yaml` | web, api, worker, mailpit, postgres, redis, minio, minio-init |
| Remote storage | `compose.yaml` + `compose.dev.yaml` + `compose.remote-storage.yaml` | web, api, worker, mailpit only |

## 10. Service URLs (local development)

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:3000 | Next.js |
| API | http://localhost:8000 | FastAPI |
| API Docs | http://localhost:8000/docs | Swagger UI (dev only) |
| PostgreSQL | localhost:5434 | local storage mode only — maps to container port 5432 |
| Redis | localhost:6380 | local storage mode only — maps to container port 6379 |
| MinIO API | http://localhost:9000 | local storage mode only |
| MinIO Console | http://localhost:9001 | local storage mode only |
| Mailpit UI | http://localhost:8025 | Captured local emails |
| Mailpit SMTP | localhost:1025 | Dev SMTP relay |

In remote storage mode, PostgreSQL/Redis/object storage are reachable at
the storage server's own address instead (e.g. `192.168.10.81:5544` —
see [infrastructure/storage-server/README.md](infrastructure/storage-server/README.md)).

All host ports are configurable via `.env` (see below) in case of local port
conflicts.

## 11. Environment Configuration

Copy [.env.example](.env.example) to `.env` (the bootstrap scripts do this
for you and generate local secrets). Every variable is documented inline.
Full reference: [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md).
For remote storage mode, also see [.env.remote-storage.example](.env.remote-storage.example).

**Never commit a real `.env` file.** It is excluded via `.gitignore`.

## 12. Database Migrations

```bash
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api alembic upgrade head
```

(Drop `-f compose.local-storage.yaml -f compose.local-storage.dev.yaml`
and add `-f compose.remote-storage.yaml` if running in remote storage
mode.)

The initial migration enables the `postgis` and `pgcrypto` extensions. No
marketplace schema exists yet.

## 13. Running Tests

```bash
# Frontend
pnpm --filter @naksha/web test
pnpm --filter @naksha/web test:e2e   # Playwright scaffold

# Backend
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api pytest

# Worker
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec worker pytest
```

## 14. Worker Validation

```bash
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec worker \
  celery -A worker.main call system.ping
```

## 15. Troubleshooting

| Symptom | Fix |
|---|---|
| Port already in use | Change the relevant `*_HOST_PORT` value in `.env`, then `docker compose ... up -d` again |
| `/api/v1/health/ready` reports a dependency as `unavailable` | Run `docker compose ps` to confirm the dependency container is healthy; check `docker compose logs <service>` |
| Frontend shows "API unavailable" | Confirm `NEXT_PUBLIC_API_URL` in `.env` matches the API's published port |
| Alembic can't connect | Local storage mode: confirm `DATABASE_URL` host is `postgres` (the Compose service name). Remote storage mode: confirm `DATABASE_HOST`/`DATABASE_PORT` in `.env` match the storage server exactly |
| MinIO buckets missing | Local storage mode: check the `minio-init` container logs. Remote storage mode: run `check-storage.ps1` on the storage server |

Run `./scripts/check-health.ps1` or `./scripts/check-health.sh` for an
automated diagnostic pass (local storage mode). For remote storage mode,
run `infrastructure/storage-server/scripts/check-storage.ps1` **on the
storage-server machine**.

## 16. Security Warning

The default `.env.example` values (database password, MinIO keys, secret
key) are **local-development placeholders only**. The bootstrap scripts
generate random local secrets so you never run with the literal example
text. **Never reuse these values, or any value from a development `.env`,
in a staging or production environment.** See [docs/SECURITY.md](docs/SECURITY.md).

## 17. Future Development Phases

This foundation intentionally excludes marketplace logic. Planned phases:

1. Authentication & authorization, organizations, RBAC
2. Dataset catalog & metadata ingestion (STAC-aligned)
3. Interactive map search, AOI drawing, and pricing engine
4. Orders, payments, and licensing
5. Clipping/conversion processing pipelines (raster, vector, LiDAR)
6. Secure, short-lived signed download delivery
7. Notifications, audit logging, admin console
8. Production cloud deployment (Terraform modules are scaffolded but
   unprovisioned — see [infrastructure/README.md](infrastructure/README.md))

---

For system design details see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
For geospatial conventions see [docs/GEOSPATIAL_STANDARDS.md](docs/GEOSPATIAL_STANDARDS.md).
For running the app on a shared remote server when local machines can't run Docker/databases, see [docs/REMOTE_SERVER_RUNBOOK.md](docs/REMOTE_SERVER_RUNBOOK.md).
For the full validation record of this foundation, see [SETUP_REPORT.md](SETUP_REPORT.md).
