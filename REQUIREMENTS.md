# REQUIREMENTS — Naksha GeoSphere (entire project)

Everything a teammate needs to **download / install / run** the full Naksha GeoSphere
monorepo: the Next.js frontend(s), the FastAPI backend, the Celery worker, the local
Docker stack (PostgreSQL/PostGIS, Redis, MinIO, Mailpit), and the isolated
`3D components/` workflow prototype.

> This file covers the **whole repository**. If you only need the 3D workflow
> prototype, see `3D components/geosphere-globe-workflow/REQUIREMENTS.md`.

---

## 1. Required tools

| Tool | Version | Why |
| --- | --- | --- |
| **Git** | any recent | Clone the repository. |
| **Docker Desktop** | latest, with **Compose v2** (`docker compose version` must work) | Runs PostgreSQL/PostGIS, Redis, MinIO, Mailpit, API, worker, and web. **This is the main runtime.** |
| **Node.js** | **v20 or newer** (LTS recommended) | Frontend / pnpm. Declared in `engines` at repo root. |
| **pnpm** | **9.x** (repo pins `pnpm@9.15.4`) | Monorepo package manager. Enable via Corepack: `corepack enable pnpm`. |
| Python 3.10+ | optional | Only needed to run the API/worker tooling *outside* Docker (not required for the normal flow). |
| Browser | Chrome / Edge / Firefox | Open the app / e2e tests. |

Check what you have:

```bash
node --version        # >= 20
pnpm --version        # 9.x
docker --version
docker compose version   # Compose v2
git --version
```

**Docker is mandatory** — the database, cache, object storage, API and worker all run
as containers. Do **not** install PostgreSQL/Redis/MinIO on your machine.

### Node via Corepack (recommended)

```bash
corepack enable pnpm
```

The repo pins the exact pnpm version in `package.json` (`"packageManager": "pnpm@9.15.4"`),
so `pnpm install` inside the repo will use the right one.

---

## 2. Get the code

```bash
git clone <your-repo-url> naksha-geosphere
cd naksha-geosphere
```

---

## 3. Bootstrap the environment

The bootstrap script verifies Git/Docker/Compose, creates `.env` from `.env.example`
(only if `.env` doesn't already exist), and fills in randomly generated local secrets.
It **never overwrites** an existing `.env`.

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
```

**Linux / macOS / Git Bash:**

```bash
chmod +x ./scripts/bootstrap.sh
./scripts/bootstrap.sh
```

Result: a `.env` file at the repo root with all credentials. Keep it private — never
commit it.

---

## 4. Install frontend dependencies (pnpm)

```bash
cd naksha-geosphere
pnpm install
```

This installs the monorepo workspaces:

| Workspace | What it is |
| --- | --- |
| `apps/web` | Next.js 15 web app (`@naksha/web`) |
| `frontend` | Explore-page Next.js app (also `@naksha/web`) |
| `packages/configuration` | Shared TS/tooling base config |
| `packages/shared-types` | Shared TypeScript types |
| `packages/ui` | Shared design tokens |

**Key frontend packages installed:** `next@15.5.22`, `react@19`, `maplibre-gl@4.7.1`,
`@turf/turf`, `@aws-sdk/client-s3` + `s3-request-presigner` (MinIO access), `jszip`,
`lucide-react`, plus Vitest / Playwright / ESLint / Prettier / Tailwind tooling.

---

## 5. Start the full stack (Docker)

From the repo root:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build -d
```

> The repo's npm scripts use `compose.local-storage.yaml` overlays for the classic
> all-local setup; the **same services** are defined in `compose.yaml` + `compose.dev.yaml`.
> Prefer the bootstrap script's printed command, which matches your environment.

First run pulls/builds every image — expect several minutes, most of it spent on the
worker's GDAL base image. Subsequent runs are fast (layer caching).

### What starts

| Service | Image (pinned) | Purpose |
| --- | --- | --- |
| `postgres` | `postgis/postgis:16-3.4` | PostgreSQL + PostGIS + pgcrypto |
| `redis` | `redis:7.4.1-alpine` | Celery broker / cache |
| `minio` | `minio/minio:RELEASE.2024-12-18T13-15-44Z` | S3-compatible object storage |
| `api` | built from `services/api/Dockerfile` | FastAPI modular monolith |
| `worker` | built from `services/worker/Dockerfile` | Celery background geospatial worker (GDAL, Rasterio, GeoPandas) |
| `web` | built from `apps/web/Dockerfile` | Next.js frontend |
| Mailpit | — | Dev email catcher |

### Apply database migrations

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec api alembic upgrade head
```

Enables the `postgis` and `pgcrypto` extensions.

### Verify everything is healthy

```bash
./scripts/check-health.sh     # Linux / macOS / Git Bash
.\scripts\check-health.ps1    # Windows PowerShell
```

Checks frontend, API (root/liveness/readiness), PostgreSQL, PostGIS, Redis, MinIO
(liveness + buckets), the Celery worker, and Mailpit — OK/FAIL per check.

### Open the app

| Service | URL |
| --- | --- |
| Frontend (apps/web) | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs (dev) | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 |
| Mailpit | http://localhost:8025 |

### Useful commands

```bash
docker compose -f compose.yaml -f compose.dev.yaml logs -f      # tail logs
docker compose -f compose.yaml -f compose.dev.yaml ps           # status
docker compose -f compose.yaml -f compose.dev.yaml down         # stop (keeps volumes)
```

Run frontend checks directly (needs `pnpm install` done):

```bash
pnpm dev                  # apps/web dev server
pnpm typecheck
pnpm lint
pnpm test                 # Vitest unit tests
pnpm test:e2e             # Playwright e2e (first run: npx playwright install chromium)
```

Run API/worker checks inside Docker:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec api pytest
docker compose -f compose.yaml -f compose.dev.yaml exec api ruff check .
docker compose -f compose.yaml -f compose.dev.yaml exec worker pytest
```

---

## 6. Backend & worker requirements (reference)

The Docker images pin these — you don't install them yourself unless running Python
outside Docker.

**API** (`services/api/pyproject.toml`, Python 3.12.8 in Docker):
`fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`, `sqlalchemy` (async),
`asyncpg`, `alembic`, `redis`, `boto3` / `aioboto3` (MinIO/S3), `argon2-cffi`,
`celery[redis]`, `email-validator`, `geoalchemy2`.
Dev: `ruff`, `mypy`, `pytest`, `pytest-asyncio`, `pytest-cov`, `httpx`, `boto3-stubs`.

**Worker** (`services/worker/pyproject.toml`):
`celery[redis]`, `pydantic`, `pydantic-settings`, `rasterio`, `geopandas`, `shapely`,
`pyproj`, `fiona`. Dev: `ruff`, `mypy`, `pytest`, `pytest-cov`.

---

## 7. Remote storage mode (optional, LAN)

Instead of running PostgreSQL/Redis/MinIO locally, they can run on a **separate LAN
machine** (`192.168.10.81` in this setup):

1. Deploy the self-contained package in `infrastructure/storage-server/`
   (see its `README.md`).
2. Merge the values from `.env.remote-storage.example` into your `.env`.
3. Start only the app services:

```bash
docker compose -f compose.yaml -f compose.dev.yaml -f compose.remote-storage.yaml up --build -d
```

> Do **not** combine `compose.local-storage.yaml` and `compose.remote-storage.yaml`
> in the same command.

---

## 8. The 3D workflow prototype (isolated, optional)

The premium globe→India→Karnataka→city→AOI→delivery demo lives in:

```
3D components/geosphere-globe-workflow/
```

It is **fully self-contained** (own `package.json`, own Node 20+ requirement,
MapLibre GL JS **6.2.0**, no Docker needed). Run it separately:

```bash
cd "3D components/geosphere-globe-workflow"
npm install
npm run dev        # http://localhost:5199
```

See `3D components/geosphere-globe-workflow/REQUIREMENTS.md` for full details.

---

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| `docker compose` not found | Install Docker Desktop; ensure the Compose v2 plugin (`docker compose version`) works. |
| `pnpm` wrong version | `corepack enable pnpm` — the repo pins `pnpm@9.15.4`. |
| `.env` missing | Run the bootstrap script (step 3); it generates `.env` with secrets. |
| Port already in use (3000/8000/9001/8025) | Free the port or adjust the compose port mapping; `docker compose ps` shows what's running. |
| API/worker import errors | They run in Docker with pinned versions — `docker compose build` then `up`. |
| Playwright browsers missing | `npx playwright install chromium`. |
| MinIO buckets not created | Check `check-health` output; the compose stack includes a bucket-init step — see `compose.yaml`. |
| Satellite tiles don't load (prototype) | Needs internet to `server.arcgisonline.com`; the prototype still works with the pale-blue fallback. |

---

## 10. Reference docs

| File | Covers |
| --- | --- |
| `README.md` | Project overview, architecture, stack table |
| `docs/LOCAL_SETUP.md` | Expanded local setup walkthrough |
| `docs/ENVIRONMENT_VARIABLES.md` | Every `.env` variable explained |
| `docs/ARCHITECTURE.md` | System architecture & data flow |
| `docs/DEPLOYMENT.md` | Production deployment |
| `infrastructure/storage-server/README.md` | Separate LAN storage machine |
| `3D components/geosphere-globe-workflow/REQUIREMENTS.md` | Isolated prototype setup |
