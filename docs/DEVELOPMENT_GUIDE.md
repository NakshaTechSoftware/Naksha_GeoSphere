# Development Guide

## Repository Layout

```
apps/web/            Next.js frontend
services/api/         FastAPI modular-monolith backend
services/worker/      Celery background worker
packages/             Shared TS packages (ui, shared-types, configuration)
infrastructure/       Docker support files + Terraform scaffold
scripts/               Bootstrap / health-check / reset scripts
docs/                  This documentation set
.github/workflows/     CI
```

## Adding a Backend Domain Module

Each future domain (catalog, aoi, pricing, orders, ...) gets its own
directory under `services/api/app/modules/<domain>/`. When you start
implementing one:

1. Add `router.py` (an `APIRouter`), `schemas.py` (Pydantic models),
   `service.py` (business logic), and `models.py` (SQLAlchemy models, if
   the module owns tables) inside that directory.
2. Register the router in `app/api/v1/router.py`.
3. Add an Alembic migration (`alembic revision -m "..."`) — never hand-edit
   the database schema.
4. Add tests under `services/api/tests/`.
5. Keep the module's internals private — other modules should only use
   what it exposes through `service.py`/`schemas.py`, not reach into its
   models directly. This is what keeps future service extraction cheap
   (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## Adding a Worker Task

1. Write the core logic as a plain, Celery-independent function under
   `services/worker/worker/geospatial/` (or a new subpackage) so it's
   directly unit-testable.
2. Add a thin `@app.task(name="...")` wrapper in
   `services/worker/worker/tasks/`.
3. Route it to the correct queue in `app/conf.task_routes` inside
   `services/worker/worker/main.py` if it shouldn't use `default`.
4. Never accept a raw filesystem path from task arguments for anything
   reachable from user input — pass data in-memory or as an object-storage
   key the worker fetches itself with a scoped credential.

## Adding a Frontend Component

- Design-system primitives go in `apps/web/src/components/ui/` and must
  use the CSS variables in `apps/web/src/styles/tokens.css` — never a
  hard-coded hex color.
- Feature components go in `apps/web/src/components/<feature>/`.
- Add a Vitest + React Testing Library test in `apps/web/tests/` for any
  non-trivial component.

## Commands

| Purpose | Command |
|---|---|
| Frontend dev server | `pnpm --filter @naksha/web dev` |
| Frontend lint | `pnpm --filter @naksha/web lint` |
| Frontend typecheck | `pnpm --filter @naksha/web typecheck` |
| Frontend unit tests | `pnpm --filter @naksha/web test` |
| Frontend build | `pnpm --filter @naksha/web build` |
| Backend format check | `ruff format --check .` (in `services/api`) |
| Backend lint | `ruff check .` (in `services/api`) |
| Backend types | `mypy .` (in `services/api`) |
| Backend tests | `pytest` (in `services/api`) |
| Worker tests | `pytest` (in `services/worker`) |
| Start stack | `docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d` |
| Stop stack | `docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml down` |
| Logs | `docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml logs -f` |
| Migrate | `docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api alembic upgrade head` |
| Worker ping | `docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec worker celery -A worker.main call system.ping` |
| Health check | `./scripts/check-health.sh` or `.\scripts\check-health.ps1` |

## Code Style

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full checklist run in CI.

## Pre-commit

```bash
pip install pre-commit
pre-commit install
```
