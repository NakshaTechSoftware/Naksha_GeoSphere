"""Geometry helpers backing the MinIO/GeoJSON fallback path.

Used only when a layer or POI type has no PostGIS table yet (see
nearby_service.py / spatial_service.py) — the primary path is always
PostGIS (ST_DWithin / ST_Contains), per the architecture spec's
"PostGIS first priority" rule.
"""

from __future__ import annotations

import math
from typing import Any

from shapely.geometry import Point, shape


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 points, in meters."""
    earth_radius_m = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_m * c


def feature_representative_point(feature: dict[str, Any]) -> Point:
    """A point to measure distance from for any geometry type (point/line/polygon)."""
    geom = shape(feature["geometry"])
    if geom.geom_type == "Point":
        return geom
    return geom.centroid


def nearest_features_within_radius(
    feature_collection: dict[str, Any],
    lat: float,
    lon: float,
    radius_meters: float,
    limit: int = 10,
) -> list[tuple[dict[str, Any], float]]:
    """Return (feature, distance_meters) pairs within radius, nearest first.

    Distance is haversine to each feature's representative point — adequate
    at city/district scale, matching the precision the rest of the codebase
    already accepts for its own Turf.js-based GeoJSON filtering.
    """
    origin_lat, origin_lon = lat, lon
    scored: list[tuple[dict[str, Any], float]] = []
    for feature in feature_collection.get("features", []):
        try:
            point = feature_representative_point(feature)
        except Exception:
            continue
        distance = haversine_distance_meters(origin_lat, origin_lon, point.y, point.x)
        if distance <= radius_meters:
            scored.append((feature, distance))
    scored.sort(key=lambda pair: pair[1])
    return scored[:limit]


def point_in_polygon_feature(
    feature_collection: dict[str, Any], lat: float, lon: float, operation: str = "point_in_polygon"
) -> dict[str, Any] | None:
    """Return the first polygon/multipolygon feature satisfying `operation` for (lat, lon).

    operation:
      point_in_polygon / within -> polygon.contains(point)
      contains                 -> polygon.contains(point)  (point is degenerate "geometry")
      intersects                -> polygon.intersects(point)
    """
    query_point = Point(lon, lat)
    for feature in feature_collection.get("features", []):
        try:
            geom = shape(feature["geometry"])
        except Exception:
            continue
        if operation == "intersects":
            matched = geom.intersects(query_point)
        else:
            matched = geom.contains(query_point)
        if matched:
            return feature
    return None
