#!/usr/bin/env bash
# Naksha GeoSphere — DESTRUCTIVE local reset (Linux/macOS/Git Bash).
#
# Stops the local stack and deletes ONLY this project's named Docker
# volumes (postgres-data, minio-data) and locally built images. Never
# touches any other Docker project, container, image, or volume, and
# never touches anything outside this repository. Requires typed
# confirmation and never runs unattended.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

cat <<'BANNER'
================================================================
 WARNING: Naksha GeoSphere local reset
================================================================
This will:
  - Stop all Naksha GeoSphere containers (compose project: naksha_geosphere)
  - Permanently DELETE the local PostgreSQL data volume
  - Permanently DELETE the local MinIO data volume
  - Remove locally built Naksha GeoSphere images for this project

It will NOT touch:
  - Any other Docker project, container, image, or volume on this machine
  - Anything outside this repository

This action cannot be undone. Local database contents and locally
uploaded/staged objects will be lost.
================================================================
BANNER

read -r -p "Type RESET (all caps) to continue, anything else cancels: " CONFIRM
if [ "$CONFIRM" != "RESET" ]; then
  echo "Aborted — nothing was changed."
  exit 1
fi

echo "--> Stopping stack and removing this project's volumes and local images..."
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml down --volumes --remove-orphans --rmi local

echo ""
echo "--> Reset complete."
echo "    Run scripts/bootstrap.sh if you need a fresh .env, then:"
echo "    docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d"
