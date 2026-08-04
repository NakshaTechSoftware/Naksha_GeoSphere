# syntax=docker/dockerfile:1.7

################################################################################
# Naksha GeoSphere — Worker (services/worker) multi-stage Dockerfile
#
# Based on the official OSGeo GDAL image so `gdalinfo`, `ogr2ogr`, and the
# other GDAL CLI utilities required by future clipping/conversion
# pipelines are present alongside the Python GDAL bindings.
#
# Targets:
#   dev     — includes dev/test deps, used by compose.dev.yaml
#   runner  — minimal production runtime, non-root, no dev deps
################################################################################

ARG GDAL_IMAGE=ghcr.io/osgeo/gdal:ubuntu-small-3.9.3

# ---------------------------------------------------------------------------
# base — Python venv + production dependencies
# ---------------------------------------------------------------------------
FROM ${GDAL_IMAGE} AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*
# NOTE: apt package versions are intentionally not pinned to exact patch
# releases (see services/api/Dockerfile for the same rationale). The base
# image tag (GDAL_IMAGE) and all pip dependencies below are pinned.

ENV VIRTUAL_ENV=/opt/venv \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /build
COPY pyproject.toml ./
RUN pip install --upgrade pip==24.3.1 && pip install .

# ---------------------------------------------------------------------------
# dev — dev/test dependencies included
# ---------------------------------------------------------------------------
FROM base AS dev
RUN pip install .[dev]
WORKDIR /app
COPY . .
CMD ["celery", "-A", "worker.main", "worker", "--loglevel=info", \
     "-Q", "default,raster,vector,lidar,notifications"]

# ---------------------------------------------------------------------------
# runner — minimal, non-root production image
# ---------------------------------------------------------------------------
FROM base AS runner

RUN groupadd --gid 1001 worker \
    && useradd --uid 1001 --gid worker --shell /usr/sbin/nologin --create-home worker

WORKDIR /app
COPY --chown=worker:worker worker ./worker
COPY --chown=worker:worker pyproject.toml ./pyproject.toml

USER worker

HEALTHCHECK --interval=30s --timeout=15s --start-period=30s --retries=3 \
    CMD celery -A worker.main inspect ping -d "celery@$(hostname)" --timeout 10 || exit 1

CMD ["celery", "-A", "worker.main", "worker", "--loglevel=info", \
     "-Q", "default,raster,vector,lidar,notifications"]
