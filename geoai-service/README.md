# GeoAI Tool Adapter Service

The controlled middleware layer between an LLM/AI agent and GeoSphere's real infrastructure:

```
LLM / AI Agent
      |
      v
GeoAI Tool Adapter Service   <-- this service
      |
      v
Existing GeoSphere APIs · PostGIS · MinIO · External GIS services
```

The agent never receives a database credential, a MinIO key, or an internal API URL. It only ever calls the typed, validated, rate-limited, cached, and logged endpoints under `/geoai/*`. See [docs/API.md](docs/API.md) for the full reference and [docs/AI_FUNCTION_CALLING.md](docs/AI_FUNCTION_CALLING.md) for the OpenAI-function-calling schemas and worked examples.

No chatbot UI lives here by design — this is backend-only, meant to sit behind whatever agent runtime (LangChain, LangGraph, a raw OpenAI tool-calling loop, etc.) you choose. **Building/wiring that agent runtime is not done yet — see "What you still need to do" below.**

---

## 0. Before you start — what you need access to

This service does not stand alone; it plugs into the main **Naksha GeoSphere** stack. Get these first, from whoever owns them:

- [ ] The main GeoSphere repo, already running locally (`docker compose -f compose.yaml -f compose.dev.yaml up -d` from the repo root — see the root `README`/`.env.example`).
- [ ] A copy of the main stack's `.env` (or at least its `POSTGRES_*`, `REDIS_URL`, and internal `MINIO_*` values) — this service reuses that Postgres/PostGIS instance and Redis, it does not create its own.
- [ ] **Do not** reuse the MinIO credentials hardcoded in `frontend/src/app/api/datasets/*/route.ts` (the remote `192.168.10.81:9010` server) — those are a separate, already-flagged security issue unrelated to this service's own local/internal MinIO.
- [ ] Python **3.11 or 3.12**. Newer interpreters (3.13+, and definitely 3.14) will fail to build `pydantic-core`/`asyncpg`/`shapely` wheels from the pinned versions in `requirements.txt` — see Troubleshooting below if you hit this.
- [ ] Docker + Docker Compose, if you intend to run this containerized rather than with a local venv.

---

## 1. First-time setup

```bash
cd geoai-service

# 1. Create and activate a virtual environment (Python 3.11/3.12)
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# now edit .env — see the variable reference in section 2 below
```

### 2. Configure `.env` — what each block actually needs

| Variable | Where the value comes from |
|---|---|
| `DATABASE_URL` | Same Postgres/PostGIS instance as the main stack. Ask for a dedicated `geoai_service` role if one exists yet (it doesn't by default — see §6), otherwise the main stack's own DB credentials. |
| `REDIS_URL` | Same Redis as the main stack, **but a different DB index** (default `/2`) so this service's cache keys never collide with the main app's Celery queues. |
| `MINIO_ENDPOINT` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_SOURCE_BUCKET` | The main stack's **internal, local** MinIO (the one in `compose.yaml`, not the remote 192.168.10.81 one). Get these from the main repo's `.env`. |
| `GEOSPHERE_WEB_BASE_URL` | Internal Docker hostname for the Next.js BFF — `http://web:3000` if running in the same Docker network, `http://localhost:3000` if you're running this service outside Docker against a locally-running frontend. |
| `GEOSPHERE_API_BASE_URL` | Same idea, for the FastAPI backend — `http://api:8000` in-network, `http://localhost:8000` locally. |
| `GEOAI_API_KEYS` | Generate your own for local dev: `python -c "import secrets; print(secrets.token_urlsafe(32))"`. This is the key your test client / agent runtime will send as `X-API-Key`. |
| `RATE_LIMIT_PER_KEY` / `RATE_LIMIT_WINDOW_SECONDS` | Fine to leave at the `.env.example` defaults for local dev. |

Full explanation of every variable, plus what to change for production, is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 3. Run database migrations

This creates the PostGIS extension (if not already enabled) and the five `poi_*` tables with GiST indexes — it does **not** touch any table the main GeoSphere API owns.

```bash
python migrations/run_migrations.py
```

Safe to re-run — it tracks what's already applied in `geoai_schema_migrations`.

### 4. Load sample data (optional, for local testing)

```bash
python scripts/load_sample_geojson.py --type police_station --file sample_data/police_stations.geojson
```

This is the only pre-loaded dataset. See "What you still need to do" for the other four POI types.

### 5. Run it

```bash
uvicorn app.main:app --reload --port 8100
```

Or, if the main stack is already up and you'd rather run this in Docker alongside it:

```bash
docker compose up --build -d
```

### 6. Verify it's working

```bash
curl http://localhost:8100/health
# {"status":"ok","service":"GeoAI Tool Adapter Service","version":"1.0.0"}

curl http://localhost:8100/geoai/tools/definitions -H "X-API-Key: <your GEOAI_API_KEYS value>"
# should return the 5-tool JSON schema array
```

Interactive API docs: `http://localhost:8100/docs`.

### 7. Run the test suite

```bash
pytest
```

All 13 tests should pass without a live Postgres or Redis connection — DB-dependent service calls are mocked at the boundary, and the cache/rate-limiter both fail open if Redis is unreachable. If a test fails on a fresh machine, see Troubleshooting.

---

## What's implemented

| Feature | Where |
|---|---|
| Nearby search (PostGIS `ST_DWithin`/`ST_Distance` first, MinIO+Shapely fallback) | `app/services/nearby_service.py`, `POST /geoai/nearby` |
| Spatial layer query (`ST_Contains`/`ST_Intersects` first, MinIO+Shapely fallback) | `app/services/spatial_service.py`, `POST /geoai/query-layer` |
| OpenAI function-calling tool schemas + dispatcher | `app/api/tools.py`, `GET /geoai/tools/definitions`, `POST /geoai/tools/execute` |
| API-key auth, Redis rate limiting | `app/core/security.py`, `app/core/rate_limit.py` |
| Redis response caching (nearby / geocode / layer-query) | `app/core/cache.py` |
| Structured per-tool-call audit logging | `app/core/logging.py` |
| PostGIS POI tables (`poi_police_station`, `poi_hospital`, `poi_school`, `poi_atm`, `poi_pharmacy`) with GiST indexes | `app/database/models.py`, `migrations/002_poi_tables.sql` |
| Adapters wrapping existing GeoSphere APIs (geocode, routing, land records, environment, dataset layers) | `app/services/geo_service.py`, `app/api/geocode.py` |

---

## What you still need to do

This repo is a working foundation, not a finished product. In rough priority order:

1. **Load real POI data.** Only `police_station` has a MinIO fallback source wired up (`app/services/nearby_service.py::MINIO_FALLBACK_KEYS`), and even that returns nothing until `poi_police_station` is populated or a real MinIO key is confirmed. `hospital`, `school`, `atm`, `pharmacy` have no data source at all yet — either source a GeoJSON layer per type and add it to `MINIO_FALLBACK_KEYS`, or bulk-load a real POI dataset into the matching `poi_*` table with `scripts/load_sample_geojson.py` as a starting template.
2. **Wire up an actual agent runtime.** This service exposes the tool surface (`/geoai/tools/definitions`, `/geoai/tools/execute`) but does not include an LLM client, a conversation loop, or a chat UI — by design (see Feature 3 in the original spec). Pick a runtime (LangChain, LangGraph, a raw OpenAI/Anthropic tool-calling loop) and point it at this service's `X-API-Key`-authenticated endpoints. Start with [docs/AI_FUNCTION_CALLING.md](docs/AI_FUNCTION_CALLING.md)'s worked example.
3. **Confirm `get_route`'s dependency exists in your target environment.** It calls the main stack's `/api/routing`, which proxies a self-hosted OSRM instance — that instance is defined only in the main repo's `compose.dev.yaml` today, not `compose.prod.yaml`. If you need routing in production, that's an infra gap in the *main* repo, not something fixable here.
4. **Production hardening** — none of this is done by default. Full checklist in [docs/DEPLOYMENT.md §5](docs/DEPLOYMENT.md#5-production-hardening-checklist): a dedicated least-privilege Postgres role, network isolation, API key rotation policy, `DOCS_ENABLED=false`, a dedicated (non-dev) Redis.
5. **CI.** There's no GitHub Actions / pipeline config yet — `pytest` runs locally only. Wire it into whatever CI the main repo already uses.
6. **Expand test coverage for the PostGIS path.** `tests/test_nearby.py` and `tests/test_spatial_query.py` mock the service layer to avoid needing a live database. Add an integration test that runs against a real PostGIS instance (a `testcontainers`-backed `postgis/postgis` container is a reasonable approach) to actually exercise `_query_postgis`'s SQL.
7. **Point `query_spatial_layer`'s `LAYER_MAP` at real PostGIS tables** once any boundary layer (district/taluk/hobli/village/ward) gets loaded into Postgres — today every layer in `app/services/spatial_service.py::LAYER_MAP` falls straight through to the MinIO/Shapely path because the `table_name` slot is `None` for all of them.

---

## Project layout

```
geoai-service/
├── app/
│   ├── main.py                 # FastAPI app factory, middleware, routers
│   ├── config/settings.py      # env-sourced configuration
│   ├── api/                    # nearby.py, spatial_query.py, geocode.py, tools.py
│   ├── services/                # nearby_service, spatial_service, minio_service, geo_service
│   ├── database/                # postgres.py (async engine), models.py (poi_* ORM models)
│   ├── schemas/geoai_models.py  # every request/response Pydantic model
│   ├── utils/geometry.py        # haversine + Shapely point-in-polygon fallback
│   └── core/                    # security, rate_limit, cache, logging, middleware, exceptions
├── migrations/                  # raw SQL + run_migrations.py
├── scripts/                     # load_sample_geojson.py, export_openapi.py
├── sample_data/                 # tiny GeoJSON fixture for local testing
├── tests/
├── Dockerfile
├── docker-compose.yml
└── docs/                        # API.md, AI_FUNCTION_CALLING.md, DEPLOYMENT.md, openapi.json (generated)
```

---

## Troubleshooting

**`pip install -r requirements.txt` fails building `pydantic-core` / `asyncpg` / `shapely` wheels.**
Your Python interpreter is too new for the pinned versions (this happens on 3.13+, and reliably on 3.14). Install Python 3.11 or 3.12 specifically for this project's venv, rather than bumping the pins — the Docker image (`python:3.11-slim`) is what actually ships, so keep local dev matching it.

**Every request returns `400 Bad Request`, even `/health`.**
`TrustedHostMiddleware` is rejecting the `Host` header. This happens if you're hitting the service through a hostname not listed in `TRUSTED_HOSTS` (e.g. testing through a proxy or a different local hostname) — add it to the comma-separated list in `.env`.

**Requests return `401 Unauthorized`.**
Either `GEOAI_API_KEYS` is unset/empty in `.env` (the service fails closed — an empty allow-list is never treated as "open access"), or your client isn't sending the `X-API-Key` header at all.

**`/geoai/nearby` always returns empty `results` for a type other than `police_station`.**
Expected — see "What you still need to do" item 1. No data source exists yet for `hospital`/`school`/`atm`/`pharmacy`.

**Redis/Postgres connection errors on startup.**
The cache and rate limiter are designed to fail open (they log a warning and continue), but the actual PostGIS queries in `nearby_service._query_postgis` and `spatial_service._query_postgis` need a real `DATABASE_URL` — confirm you can reach the main stack's Postgres from wherever you're running this (Docker network vs. `localhost` port mapping is the usual culprit).
