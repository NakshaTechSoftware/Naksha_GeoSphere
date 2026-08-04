# syntax=docker/dockerfile:1.7

################################################################################
# Naksha GeoSphere — API (services/api) multi-stage Dockerfile
#
# Targets:
#   dev     — reload-enabled dev server (used by compose.dev.yaml)
#   runner  — minimal production runtime, non-root, no --reload
################################################################################

ARG PYTHON_VERSION=3.12.8-slim-bookworm

# ---------------------------------------------------------------------------
# builder — install dependencies into a venv (compiler toolchain lives here
# only, never copied into the runtime image)
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*
# NOTE: apt package versions are intentionally not pinned to exact patch
# releases — Debian bookworm's security-updated point releases rotate
# frequently and would make this Dockerfile brittle. The Docker base image
# tag (PYTHON_VERSION) and all pip/npm dependencies below are pinned.

ENV VIRTUAL_ENV=/opt/venv \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /build
COPY pyproject.toml ./
RUN pip install --upgrade pip==24.3.1 && pip install .

# ---------------------------------------------------------------------------
# dev — includes dev/test dependencies + reload server
# ---------------------------------------------------------------------------
FROM builder AS dev
RUN pip install .[dev]
WORKDIR /app
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---------------------------------------------------------------------------
# runner — minimal, non-root production image
# ---------------------------------------------------------------------------
FROM python:${PYTHON_VERSION} AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 apiuser \
    && useradd --uid 1001 --gid apiuser --shell /usr/sbin/nologin --create-home apiuser

ENV VIRTUAL_ENV=/opt/venv
COPY --from=builder $VIRTUAL_ENV $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY --chown=apiuser:apiuser app ./app
COPY --chown=apiuser:apiuser migrations ./migrations
COPY --chown=apiuser:apiuser alembic.ini ./alembic.ini
COPY --chown=apiuser:apiuser pyproject.toml ./pyproject.toml

USER apiuser
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
    CMD curl --fail http://127.0.0.1:8000/api/v1/health/live || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
