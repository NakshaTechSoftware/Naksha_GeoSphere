#!/usr/bin/env bash
# Naksha GeoSphere — automated local health check (Linux/macOS/Git Bash).
# Assumes the dev stack is already running:
#   docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run scripts/bootstrap.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

COMPOSE="docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml"
WEB_PORT="${WEB_HOST_PORT:-3000}"
API_PORT="${API_HOST_PORT:-8000}"
MINIO_API_PORT="${MINIO_API_HOST_PORT:-9000}"
MAILPIT_PORT="${MAILPIT_UI_HOST_PORT:-8025}"

PASS=0
FAIL=0

check() {
  local name="$1"
  local cmd="$2"
  printf "  %-48s" "$name"
  if eval "$cmd" >/tmp/naksha-health-check.log 2>&1; then
    echo "OK"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

echo "==> Naksha GeoSphere health check"
echo ""
echo "Container status:"
$COMPOSE ps
echo ""
echo "Checks:"

check "Frontend reachable (:$WEB_PORT)" \
  'curl -fsS -o /dev/null http://localhost:$WEB_PORT'

check "API root (:$API_PORT/)" \
  'curl -fsS -o /dev/null http://localhost:$API_PORT/'

check "API liveness (/api/v1/health/live)" \
  'curl -fsS -o /dev/null http://localhost:$API_PORT/api/v1/health/live'

check "API readiness (/api/v1/health/ready)" \
  'curl -fsS -o /dev/null http://localhost:$API_PORT/api/v1/health/ready'

check "PostgreSQL accepts connections" \
  '$COMPOSE exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

check "PostGIS extension enabled" \
  '$COMPOSE exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT PostGIS_Version();"'

check "Redis responds to PING" \
  '$COMPOSE exec -T redis redis-cli ping'

check "MinIO liveness endpoint" \
  'curl -fsS -o /dev/null http://localhost:$MINIO_API_PORT/minio/health/live'

check "Required MinIO buckets exist" \
  '$COMPOSE exec -T minio mc alias set local http://localhost:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null && \
   $COMPOSE exec -T minio mc ls "local/$S3_BUCKET_SOURCE_DATA" && \
   $COMPOSE exec -T minio mc ls "local/$S3_BUCKET_PREVIEW_DATA" && \
   $COMPOSE exec -T minio mc ls "local/$S3_BUCKET_ORDER_OUTPUT" && \
   $COMPOSE exec -T minio mc ls "local/$S3_BUCKET_TEMPORARY_DATA"'

check "Celery worker responds to ping" \
  '$COMPOSE exec -T worker celery -A worker.main inspect ping'

check "Mailpit UI reachable (:$MAILPIT_PORT)" \
  'curl -fsS -o /dev/null http://localhost:$MAILPIT_PORT'

echo ""
echo "==> $PASS passed, $FAIL failed"

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Last failing check output (see /tmp/naksha-health-check.log for the most recent):"
  tail -n 20 /tmp/naksha-health-check.log 2>/dev/null || true
fi

[ "$FAIL" -eq 0 ]
