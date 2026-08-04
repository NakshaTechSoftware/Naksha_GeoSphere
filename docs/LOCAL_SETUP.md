# Local Setup

This guide expands on the quick-start in the root [README.md](../README.md).

## Prerequisites

- Docker Desktop with Compose v2 (`docker compose version` should work)
- Git
- Optional, only if you want to run tooling *outside* Docker:
  - Node.js >= 20 and `corepack`/`pnpm`
  - Python >= 3.10 (backend/worker Docker images pin 3.12.8)

You do **not** need PostgreSQL, Redis, or MinIO installed on your machine.

## 1. Bootstrap

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
```

**Linux/macOS:**

```bash
chmod +x ./scripts/bootstrap.sh
./scripts/bootstrap.sh
```

This verifies Git/Docker/Compose are installed, creates `.env` from
`.env.example` (only if `.env` doesn't already exist), and fills in
randomly generated local secrets. It never overwrites an existing `.env`.

## 2. Start the stack

```bash
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d
```

First run pulls/builds every image — expect several minutes, most of it
spent on the worker's GDAL base image. Subsequent runs are fast thanks to
Docker layer caching.

## 3. Apply database migrations

```bash
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api alembic upgrade head
```

This enables the `postgis` and `pgcrypto` extensions. No marketplace
schema exists yet.

## 4. Verify everything is healthy

```bash
./scripts/check-health.sh      # Linux/macOS/Git Bash
.\scripts\check-health.ps1     # Windows PowerShell
```

This checks the frontend, API (root/liveness/readiness), PostgreSQL,
PostGIS, Redis, MinIO (liveness + required buckets), the Celery worker,
and Mailpit — printing OK/FAIL per check plus a summary count.

## 5. Open the app

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs (dev only) | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 |
| Mailpit | http://localhost:8025 |

## Stopping / logs / status

```bash
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml logs -f      # tail logs
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml ps           # status
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml down         # stop (keeps volumes)
```

## Resetting local data

`scripts/reset-local.ps1` / `scripts/reset-local.sh` delete this
project's Postgres and MinIO volumes (and only this project's) after an
explicit typed confirmation. See the script header before running it —
this is destructive to local data.

## Remote Storage Mode

Instead of running PostgreSQL/Redis/object storage locally, they can run
on a separate machine on the LAN — see
[infrastructure/storage-server/README.md](../infrastructure/storage-server/README.md)
for deploying that machine, and
[.env.remote-storage.example](../.env.remote-storage.example) for the
values to merge into your `.env`. Then start only the app services here:

```bash
docker compose -f compose.yaml -f compose.dev.yaml -f compose.remote-storage.yaml up --build -d
```

Do not combine `compose.local-storage.yaml` and
`compose.remote-storage.yaml` in the same command.
