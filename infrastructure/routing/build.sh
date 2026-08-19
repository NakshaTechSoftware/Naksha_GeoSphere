#!/usr/bin/env bash
# Rebuilds the Karnataka OSRM routing datasets used by the osrm-driving/osrm-walking/
# osrm-cycling Compose services (see ../../compose.dev.yaml). Run this whenever the
# underlying OSM data needs refreshing, or after a clean checkout (the output lands in
# ./data/{driving,walking,cycling}/, all gitignored - multi-GB derived files, not source).
# Takes a few minutes per profile on a normal laptop.
#
# Usage: bash infrastructure/routing/build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
OSRM_IMAGE="ghcr.io/project-osrm/osrm-backend:v6.0.0"
EXTRACT_URL="https://download.openstreetmap.fr/extracts/asia/india/karnataka-latest.osm.pbf"
PBF_FILE="$DATA_DIR/karnataka-latest.osm.pbf"

mkdir -p "$DATA_DIR"

echo "==> Downloading Karnataka OSM extract (~130MB)..."
curl -L -o "$PBF_FILE" "$EXTRACT_URL"

# OSRM's car/foot/bicycle profiles (bundled in the image at /opt/*.lua) each need their own
# extract/partition/customize pass over the same source PBF - a road network's weights and
# even which ways are routable at all differ per mode (e.g. footpaths car.lua ignores,
# motorways foot.lua ignores), so they can't share one dataset the way the local/highways
# vector tiles could just be split by category.
build_profile() {
  local mode="$1"     # subfolder name: driving | walking | cycling
  local profile="$2"  # OSRM bundled profile: car | foot | bicycle

  local dir="$DATA_DIR/$mode"
  mkdir -p "$dir"
  cp "$PBF_FILE" "$dir/karnataka-latest.osm.pbf"

  echo "==> [$mode] Extracting ($profile profile)..."
  MSYS_NO_PATHCONV=1 docker run --rm -v "$dir":/data "$OSRM_IMAGE" \
    osrm-extract -p "/opt/$profile.lua" /data/karnataka-latest.osm.pbf

  echo "==> [$mode] Partitioning..."
  MSYS_NO_PATHCONV=1 docker run --rm -v "$dir":/data "$OSRM_IMAGE" \
    osrm-partition /data/karnataka-latest.osrm

  echo "==> [$mode] Customizing..."
  MSYS_NO_PATHCONV=1 docker run --rm -v "$dir":/data "$OSRM_IMAGE" \
    osrm-customize /data/karnataka-latest.osrm

  # The raw .osm.pbf is only needed during extract - drop the per-profile copy once done.
  rm -f "$dir/karnataka-latest.osm.pbf"
}

build_profile driving car
build_profile walking foot
build_profile cycling bicycle

rm -f "$PBF_FILE"

echo "==> Done. Bring up the routing services with:"
echo "    docker compose -f compose.yaml -f compose.dev.yaml up -d osrm-driving osrm-walking osrm-cycling"
