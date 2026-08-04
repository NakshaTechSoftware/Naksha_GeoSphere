# services/worker — Naksha GeoSphere Background Worker

Celery worker for geospatial background processing. No real dataset
clipping/conversion pipelines exist yet — this phase proves the worker,
its queues, and its geospatial toolchain (GDAL, rasterio, GeoPandas,
Shapely, PyProj, Fiona) are correctly wired to Redis and each other.

## Tasks

| Task | Purpose |
|---|---|
| `system.ping` | Confirms the worker is alive and consuming tasks |
| `geospatial.inspect_runtime` | Reports installed GDAL/rasterio/GeoPandas/Shapely/PyProj/Fiona versions (never environment values) |
| `geospatial.validate_sample` | Validates an in-memory GeoJSON geometry via Shapely — never touches the filesystem |

## Queues

`default`, `raster`, `vector`, `lidar`, `notifications` are all declared
in `worker/main.py`. Only `default` has tasks routed to it today; the
others are reserved for the future processing pipelines.

## Running locally (outside Docker)

```bash
python -m venv .venv
. .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"

# requires CELERY_BROKER_URL and CELERY_RESULT_BACKEND in the environment
celery -A worker.main worker --loglevel=info -Q default,raster,vector,lidar,notifications
```

## Verifying the worker

```bash
celery -A worker.main inspect ping
celery -A worker.main call system.ping
```

## Testing

```bash
pytest
```

Tests exercise the plain Python functions behind each task
(`worker/geospatial/*.py`) directly, so they don't require a running
broker.

## Quality gates

```bash
ruff format --check .
ruff check .
mypy .
```
