# services/api — Naksha GeoSphere API

FastAPI modular-monolith backend. Domain logic lives under
`app/modules/<domain>/` (currently placeholders); cross-cutting concerns
live in `app/core`, `app/database`, `app/services`, `app/schemas`.

## Endpoints (foundation phase)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Platform metadata + docs link |
| GET | `/api/v1/health/live` | Liveness — process only, no dependencies |
| GET | `/api/v1/health/ready` | Readiness — checks Postgres/PostGIS, Redis, object storage |
| GET | `/api/v1/health` | Aggregated snapshot consumed by the frontend |

## Running locally (outside Docker)

```bash
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"

# requires DATABASE_URL, REDIS_URL, CELERY_BROKER_URL, CELERY_RESULT_BACKEND,
# MINIO_ACCESS_KEY, MINIO_SECRET_KEY, SECRET_KEY in the environment (see
# repo-root .env.example) — or just run the full stack via Docker instead.
uvicorn app.main:app --reload
```

## Testing

```bash
pytest                          # unit tests (no live infra required)
RUN_INTEGRATION_TESTS=1 pytest -m integration   # requires a live DATABASE_URL
```

## Quality gates

```bash
ruff format --check .
ruff check .
mypy .
```

## Migrations

```bash
alembic upgrade head
alembic revision -m "description of change"
```

`DATABASE_URL` must be set in the environment — `migrations/env.py`
refuses to run without it rather than falling back to a default.
