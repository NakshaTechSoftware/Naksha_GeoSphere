# Deployment Instructions

## 1. Prerequisites

- The main GeoSphere stack already running (`docker compose -f compose.yaml -f compose.dev.yaml up -d` from the repo root) — this service reuses its Postgres/PostGIS, Redis, and reaches its `web`/`api` containers by Docker hostname. It does not stand up its own copies of any of those.
- Docker network `naksha-network` exists (created by the main stack's compose file).

## 2. Configure

```bash
cd geoai-service
cp .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — same Postgres instance/credentials as the main stack (or a dedicated least-privilege role, see §5 below).
- `REDIS_URL` — same Redis, **different DB index** (`/2` by default) so key sweeps never collide with Celery.
- `MINIO_*` — internal MinIO credentials. **Never** the ones hardcoded in `frontend/src/app/api/datasets/*/route.ts` for the remote 192.168.10.81 server — those are a separate, already-flagged security issue (see the architecture audit) and must be rotated independently of this service.
- `GEOSPHERE_WEB_BASE_URL` / `GEOSPHERE_API_BASE_URL` — internal Docker hostnames (`http://web:3000`, `http://api:8000`), never a public URL.
- `GEOAI_API_KEYS` — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`. This is the only credential the AI agent runtime ever holds for reaching this service.

## 3. Run database migrations

```bash
pip install -r requirements.txt   # or use the Docker image, see below
DATABASE_URL=postgresql+asyncpg://... python migrations/run_migrations.py
```

This creates the PostGIS extension (if missing) and the five `poi_*` tables with their GiST indexes. It is idempotent — safe to re-run.

Optionally seed sample data for local testing:

```bash
DATABASE_URL=postgresql+asyncpg://... python scripts/load_sample_geojson.py \
    --type police_station --file sample_data/police_stations.geojson
```

## 4. Build and run

```bash
docker compose up --build -d
```

The service comes up on `http://localhost:${GEOAI_HOST_PORT:-8100}` (mapped) / `http://geoai-service:8000` (internal, for the agent runtime). Confirm health:

```bash
curl http://localhost:8100/health
```

## 5. Production hardening checklist

These are **not yet done by default** — apply before exposing this service beyond local development, per the architecture audit's §08:

- [ ] Create a dedicated Postgres role for this service with `SELECT`/`INSERT`/`UPDATE` on `poi_*` tables only — do not reuse the main app's `naksha_app` superuser-adjacent role in production.
- [ ] Put this service behind an internal-only network boundary (no public ingress) — only the agent runtime should ever reach it.
- [ ] Rotate `GEOAI_API_KEYS` on a schedule; the comma-separated format supports zero-downtime rotation (add new key, redeploy the agent runtime, remove old key).
- [ ] Point Redis at a dedicated DB index or instance in production, not `/2` on a shared dev Redis.
- [ ] Set `DOCS_ENABLED=false` in production — `/docs` and `/openapi.json` are useful for integration but reveal the full request/response contract publicly if left on.
- [ ] Confirm OSRM (the routing backend `get_route` depends on) actually exists in the target environment — per the architecture audit, it is defined **only** in `compose.dev.yaml` today, not `compose.prod.yaml`.

## 6. Running tests

```bash
pip install -r requirements.txt
pytest
```

Tests do not require a live Postgres — DB-dependent service calls are mocked at the boundary (see `tests/conftest.py`). The rate limiter and cache both fail open if Redis is unreachable, so tests run without a live Redis too.

## 7. Exporting the OpenAPI spec

```bash
python scripts/export_openapi.py
```

Writes `docs/openapi.json`. Re-run after changing any route or schema.
