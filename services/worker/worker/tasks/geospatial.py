"""Geospatial runtime inspection and safe sample-geometry validation.

Neither task performs real dataset processing yet — that lands with the
future clipping/conversion pipelines. These exist to prove the worker's
geospatial toolchain (GDAL, rasterio, GeoPandas, Shapely, PyProj, Fiona)
is correctly installed and reachable from a task.
"""

from __future__ import annotations

from typing import Any

from worker.geospatial.runtime_info import RuntimeInfo, collect_runtime_info
from worker.geospatial.validation import GeometryValidationResult, validate_geojson_geometry
from worker.main import app


@app.task(name="geospatial.inspect_runtime")
def inspect_runtime() -> RuntimeInfo:
    return collect_runtime_info()


@app.task(name="geospatial.validate_sample")
def validate_sample(geometry: dict[str, Any]) -> GeometryValidationResult:
    """Validates an in-memory GeoJSON geometry. Intentionally accepts only
    a geometry mapping — never a filesystem path — so this task can never
    be used to read arbitrary files from the worker's disk."""
    return validate_geojson_geometry(geometry)
