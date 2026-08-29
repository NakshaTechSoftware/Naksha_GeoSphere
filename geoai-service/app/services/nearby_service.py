"""Feature 1 — Nearby search engine.

Priority order (per spec):
  1. PostGIS poi_* table for this type, if it has any rows -> ST_DWithin +
     ST_Distance + GiST index, cast to geography for meter-accurate radius.
  2. Otherwise, fall back to a GeoJSON layer for this type in MinIO and
     compute nearest features in-process with Shapely/haversine.
"""

from __future__ import annotations

from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnsupportedTypeError
from app.database.models import POI_TYPE_MODEL_MAP
from app.schemas.geoai_models import LatLon, NearbyResultItem
from app.services import minio_service
from app.utils.geometry import nearest_features_within_radius

# Only police stations have a confirmed MinIO GeoJSON source today (see the
# architecture audit) — the others fall back to an empty result set with a
# clear "not yet available" reason until their own layer/table is loaded.
#
# This is a statewide jurisdiction-BOUNDARY file (features are polygons,
# not point locations of the stations themselves) — confirmed by listing
# the actual bucket, since the path first assumed here (.../V3/Karnataka/
# Statewide/police_stations.geojson) never existed. "Nearest" is computed
# against each polygon's centroid (see utils/geometry.py), which is an
# approximation — a real point dataset of station locations would be more
# accurate if one ever gets sourced.
MINIO_FALLBACK_KEYS: dict[str, str] = {
    "police_station": "Police Station Boundaries/KARNATAKA_POLICE_STATIONS.geojson",
}


async def find_nearby(
    session: AsyncSession, poi_type: str, lat: float, lon: float, radius: int, limit: int
) -> tuple[list[NearbyResultItem], str]:
    model = POI_TYPE_MODEL_MAP.get(poi_type)
    if model is None:
        raise UnsupportedTypeError(f"Unsupported nearby type: '{poi_type}'")

    postgis_results = await _query_postgis(session, model, poi_type, lat, lon, radius, limit)
    if postgis_results:
        return postgis_results, "postgis"

    fallback_results = _query_minio_fallback(poi_type, lat, lon, radius, limit)
    return fallback_results, "minio_geojson"


async def _query_postgis(
    session: AsyncSession, model, poi_type: str, lat: float, lon: float, radius: int, limit: int
) -> list[NearbyResultItem]:
    point = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    geography_point = func.cast(point, Geography)
    geography_col = func.cast(model.geometry, Geography)

    distance_expr = func.ST_Distance(geography_col, geography_point).label("distance_meters")
    stmt = (
        select(
            model.name,
            model.address,
            model.phone,
            func.ST_Y(model.geometry).label("lat"),
            func.ST_X(model.geometry).label("lon"),
            distance_expr,
        )
        .where(func.ST_DWithin(geography_col, geography_point, radius))
        .order_by(distance_expr)
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        NearbyResultItem(
            name=row.name,
            type=poi_type,
            distance_meters=round(float(row.distance_meters), 1),
            location=LatLon(lat=row.lat, lon=row.lon),
            address=row.address,
            phone=row.phone,
            source="postgis",
        )
        for row in rows
    ]


def _query_minio_fallback(
    poi_type: str, lat: float, lon: float, radius: int, limit: int
) -> list[NearbyResultItem]:
    object_key = MINIO_FALLBACK_KEYS.get(poi_type)
    if object_key is None:
        return []

    feature_collection = minio_service.get_geojson_cached(object_key)
    scored = nearest_features_within_radius(feature_collection, lat, lon, radius, limit)

    results: list[NearbyResultItem] = []
    for feature, distance in scored:
        props = feature.get("properties", {})
        geom = feature["geometry"]
        if geom["type"] == "Point":
            point_lon, point_lat = geom["coordinates"][0], geom["coordinates"][1]
        else:
            from shapely.geometry import shape

            centroid = shape(geom).centroid
            point_lon, point_lat = centroid.x, centroid.y
        # Real-world property keys vary a lot by source layer (the Karnataka
        # police-jurisdiction file uses "_police_station"/"PS_BOUNDName",
        # not "name"), so try a few in order rather than assuming one.
        name = (
            props.get("name")
            or props.get("NAME")
            or props.get("_police_station")
            or props.get("PS_BOUNDName")
            or "Unnamed"
        )
        results.append(
            NearbyResultItem(
                name=name,
                type=poi_type,
                distance_meters=round(distance, 1),
                location=LatLon(lat=point_lat, lon=point_lon),
                address=props.get("address"),
                phone=props.get("phone"),
                source="minio_geojson",
            )
        )
    return results
