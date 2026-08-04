# Contributing to Naksha GeoSphere

## Branching

- `main` — always deployable; protected.
- `feature/<short-description>` — new work, branched from `main`.
- `fix/<short-description>` — bug fixes.
- `chore/<short-description>` — tooling, CI, docs.

Open a pull request into `main`. Squash-merge once approved and CI is green.

## Commit Messages

Use conventional, imperative commit messages, e.g.:

```
feat(api): add readiness endpoint for PostGIS
fix(worker): correct celery queue routing for lidar tasks
docs: document signed URL expiry configuration
```

## Before Opening a Pull Request

Run the checks relevant to what you changed:

```bash
# Frontend
pnpm --filter @naksha/web lint
pnpm --filter @naksha/web typecheck
pnpm --filter @naksha/web test
pnpm --filter @naksha/web build

# Backend / Worker (inside their containers or a matching local venv)
ruff format --check .
ruff check .
mypy .
pytest
```

Or simply let CI run — `frontend-ci.yml` and `backend-ci.yml` run all of the
above automatically on every pull request.

## Code Style

- Frontend: ESLint + Prettier, enforced in CI. No inline hex colors — use
  the CSS design tokens in `apps/web/src/styles`.
- Backend/Worker: Ruff (format + lint) and MyPy in strict-ish mode. Type
  hints are required on public functions.
- Keep the backend a **modular monolith** — new domain logic goes in
  `services/api/app/modules/<domain>/`, not in a shared "utils" dump.

## Environment

Never commit `.env`. Never hardcode credentials, tokens, or connection
strings — use `app/core/config.py` (backend) or `process.env` via the typed
config (frontend).

## Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

This runs formatting/lint checks automatically before each commit — see
`.pre-commit-config.yaml`.

## Security

Do not open a public issue for a suspected vulnerability — see
[SECURITY.md](SECURITY.md) for how to report privately.
