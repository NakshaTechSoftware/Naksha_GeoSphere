#!/usr/bin/env bash
# Naksha GeoSphere — local development bootstrap (Linux/macOS/Git Bash).
#
# - Verifies Git, Docker, and Docker Compose are installed.
# - Creates .env from .env.example (only if .env does not already exist —
#   an existing .env is never touched).
# - Generates random local-only secrets and writes them into the new .env.
# - Creates local working directories the stack expects.
#
# Secrets are written directly to .env and are never printed to the
# console.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Naksha GeoSphere bootstrap"

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required tool '$1' was not found on PATH." >&2
    exit 1
  fi
}

echo "--> Checking required tools..."
require git
require docker
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' (the Compose v2 plugin) is required." >&2
  exit 1
fi
echo "    git, docker, docker compose: OK"

gen_secret() {
  # Emits up to 32 URL-safe characters of randomness. Never logged.
  local bytes="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n=+/'
  else
    head -c "$bytes" /dev/urandom | base64 | tr -d '\n=+/'
  fi | cut -c1-32
}

sedi() {
  # Portable in-place sed for GNU sed (Linux/Git Bash) and BSD sed (macOS).
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

if [ -f .env ]; then
  echo "--> .env already exists — leaving it untouched."
else
  echo "--> Creating .env from .env.example..."
  cp .env.example .env

  echo "--> Generating local-only random secrets (values are not printed)..."
  POSTGRES_PW="$(gen_secret 24)"
  MINIO_ACCESS="naksha_$(gen_secret 12)"
  MINIO_SECRET="$(gen_secret 24)"
  APP_SECRET="$(gen_secret 32)"

  sedi "s|POSTGRES_PASSWORD=REPLACE_WITH_LOCAL_DEV_SECRET|POSTGRES_PASSWORD=${POSTGRES_PW}|" .env
  sedi "s|DATABASE_URL=postgresql+asyncpg://naksha_app:REPLACE_WITH_LOCAL_DEV_SECRET@postgres:5432/naksha_geosphere|DATABASE_URL=postgresql+asyncpg://naksha_app:${POSTGRES_PW}@postgres:5432/naksha_geosphere|" .env
  sedi "s|MINIO_ACCESS_KEY=REPLACE_WITH_LOCAL_ACCESS_KEY|MINIO_ACCESS_KEY=${MINIO_ACCESS}|" .env
  sedi "s|MINIO_SECRET_KEY=REPLACE_WITH_LOCAL_SECRET_KEY|MINIO_SECRET_KEY=${MINIO_SECRET}|" .env
  sedi "s|SECRET_KEY=REPLACE_WITH_GENERATED_SECRET|SECRET_KEY=${APP_SECRET}|" .env

  echo "    .env created with locally generated secrets."
fi

echo "--> Ensuring local working directories exist..."
mkdir -p infrastructure/docker/data

echo ""
echo "==> Bootstrap complete."
echo ""
echo "Next steps:"
echo "  docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d"
echo "  docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api alembic upgrade head"
echo "  ./scripts/check-health.sh"
