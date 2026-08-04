"""Pure, Celery-independent helper for reporting the geospatial toolchain
versions available in this worker's runtime. Never reports environment
variable values — only library/tool versions."""

from __future__ import annotations

import shutil
import subprocess
from typing import TypedDict


class RuntimeInfo(TypedDict):
    gdal_version: str
    gdal_cli_available: bool
    rasterio_version: str
    geopandas_version: str
    shapely_version: str
    pyproj_version: str
    fiona_version: str


def _gdal_cli_available() -> bool:
    """Checks for the `gdalinfo` CLI on PATH without ever invoking it with
    user-supplied input — this task takes no arguments."""
    return shutil.which("gdalinfo") is not None


def _gdal_cli_version() -> str | None:
    if not _gdal_cli_available():
        return None
    try:
        result = subprocess.run(  # noqa: S603 — fixed args, no user input
            ["gdalinfo", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        return result.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


def collect_runtime_info() -> RuntimeInfo:
    import fiona
    import geopandas
    import pyproj
    import rasterio
    import shapely

    bundled_gdal_version = rasterio.gdal_version()

    return RuntimeInfo(
        gdal_version=_gdal_cli_version() or f"{bundled_gdal_version} (via rasterio)",
        gdal_cli_available=_gdal_cli_available(),
        rasterio_version=rasterio.__version__,
        geopandas_version=geopandas.__version__,
        shapely_version=shapely.__version__,
        pyproj_version=pyproj.__version__,
        fiona_version=fiona.__version__,
    )
