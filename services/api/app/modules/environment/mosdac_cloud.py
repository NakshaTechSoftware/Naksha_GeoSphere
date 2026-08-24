"""MOSDAC INSAT geostationary satellite cloud imagery provider.

Fetches real-time cloud imagery from ISRO's Meteorological & Oceanographic
Satellite Data Archival Centre (MOSDAC) WMS service.

Products: INSAT-3D/3DR/3DS Imager channels (VIS, SWIR, MIR, WV, TIR1, TIR2)
"""

from __future__ import annotations

import httpx
from typing import Literal

from app.core.config import Settings, get_settings
from app.modules.environment.exceptions import UpstreamUnavailableError

MOSDAC_WMS_BASE = "https://mosdac.gov.in/geoserver/ows"
MOSDAC_WMS_VERSION = "1.3.0"

# INSAT product layers available via MOSDAC WMS
INSAT_PRODUCTS = {
    # INSAT-3DS (latest, 2024)
    "insat3ds_vis": {"layer": "insat3ds:vis", "name": "INSAT-3DS Visible", "day_night": "day"},
    "insat3ds_swir": {"layer": "insat3ds:swir", "name": "INSAT-3DS SWIR", "day_night": "day"},
    "insat3ds_mir": {"layer": "insat3ds:mir", "name": "INSAT-3DS MIR", "day_night": "both"},
    "insat3ds_wv": {"layer": "insat3ds:wv", "name": "INSAT-3DS Water Vapor", "day_night": "both"},
    "insat3ds_tir1": {"layer": "insat3ds:tir1", "name": "INSAT-3DS TIR1", "day_night": "both"},
    "insat3ds_tir2": {"layer": "insat3ds:tir2", "name": "INSAT-3DS TIR2", "day_night": "both"},
    # INSAT-3D/3DR (legacy but operational)
    "insat3d_vis": {"layer": "insat3d:vis", "name": "INSAT-3D/3DR Visible", "day_night": "day"},
    "insat3d_swir": {"layer": "insat3d:swir", "name": "INSAT-3D/3DR SWIR", "day_night": "day"},
    "insat3d_mir": {"layer": "insat3d:mir", "name": "INSAT-3D/3DR MIR", "day_night": "both"},
    "insat3d_wv": {"layer": "insat3d:wv", "name": "INSAT-3D/3DR Water Vapor", "day_night": "both"},
    "insat3d_tir1": {"layer": "insat3d:tir1", "name": "INSAT-3D/3DR TIR1", "day_night": "both"},
    "insat3d_tir2": {"layer": "insat3d:tir2", "name": "INSAT-3D/3DR TIR2", "day_night": "both"},
}

DEFAULT_DAY_PRODUCT = "insat3ds_vis"
DEFAULT_NIGHT_PRODUCT = "insat3ds_tir1"


async def _probe_mosdac_tile(
    client: httpx.AsyncClient,
    layer: str,
    time: str,
    auth_token: str | None = None,
) -> bool:
    """Probe if a MOSDAC tile exists at zoom 5 over India."""
    probe_z = 5
    probe_x = 22
    probe_y = 13

    params = {
        "service": "WMS",
        "request": "GetTile",
        "version": MOSDAC_WMS_VERSION,
        "layer": layer,
        "style": "",
        "tileMatrixSet": "EPSG:3857",
        "tileMatrix": str(probe_z),
        "tileRow": str(probe_y),
        "tileCol": str(probe_x),
        "format": "image/png",
        "time": time,
    }

    headers = {}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        resp = await client.head(MOSDAC_WMS_BASE, params=params, headers=headers, timeout=10.0)
        return resp.is_success
    except httpx.HTTPError:
        return False


async def get_latest_insat_cloud_frame(
    day_night: Literal["day", "night"] = "day",
    product_id: str | None = None,
    settings: Settings | None = None,
) -> dict | None:
    """
    Get the latest available INSAT cloud frame from MOSDAC WMS.

    Returns a dict with: product_id, layer, time (ISO), satellite_name, tile_url_template
    """
    if settings is None:
        settings = get_settings()

    auth_token = getattr(settings, "mosdac_auth_token", None)

    # Determine which product to use
    if product_id and product_id in INSAT_PRODUCTS:
        products_to_try = [product_id]
    elif day_night == "day":
        products_to_try = ["insat3ds_vis", "insat3d_vis", "insat3ds_swir", "insat3d_swir"]
    else:
        products_to_try = ["insat3ds_tir1", "insat3d_tir1", "insat3ds_wv", "insat3d_wv"]

    # Generate candidate times (last 3 hours, 15-min intervals)
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    candidate_times = []
    for i in range(12):
        t = now.replace(minute=(now.minute // 15) * 15, second=0, microsecond=0)
        candidate_times.append(t.isoformat().replace("+00:00", "Z"))
        now = now - timedelta(minutes=15)

    async with httpx.AsyncClient(timeout=10.0) as client:
        for pid in products_to_try:
            product = INSAT_PRODUCTS[pid]
            for time in candidate_times:
                if await _probe_mosdac_tile(client, product["layer"], time, auth_token):
                    return {
                        "product_id": pid,
                        "layer": product["layer"],
                        "time": time,
                        "satellite_name": product["name"],
                        "day_night": day_night,
                        "tile_url_template": build_mosdac_tile_url_template(product["layer"], time),
                    }
    return None


def build_mosdac_tile_url_template(layer: str, time: str) -> str:
    """Build a WMTS-style tile URL template for MapLibre raster source."""
    # Note: MOSDAC WMS GetTile uses {tileMatrix}/{tileRow}/{tileCol} = z/y/x
    # MapLibre expects {z}/{x}/{y} so we need to handle the y/x swap
    # This is a template - the actual tile fetching will be via a custom protocol
    # or by using the WMS endpoint directly with proper tile coordinates.
    from urllib.parse import urlencode

    params = {
        "service": "WMS",
        "request": "GetTile",
        "version": MOSDAC_WMS_VERSION,
        "layer": layer,
        "style": "",
        "tileMatrixSet": "EPSG:3857",
        "tileMatrix": "{z}",
        "tileRow": "{y}",
        "tileCol": "{x}",
        "format": "image/png",
        "time": time,
    }
    return f"{MOSDAC_WMS_BASE}?{urlencode(params)}"


def get_available_insat_products() -> list[dict]:
    """Get list of available INSAT products for UI selection."""
    return [
        {
            "id": pid,
            "name": info["name"],
            "layer": info["layer"],
            "day_night": info["day_night"],
        }
        for pid, info in INSAT_PRODUCTS.items()
    ]