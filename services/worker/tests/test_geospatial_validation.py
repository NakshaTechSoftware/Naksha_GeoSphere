from worker.geospatial.validation import validate_geojson_geometry

VALID_POINT = {"type": "Point", "coordinates": [77.5946, 12.9716]}

VALID_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
}

SELF_INTERSECTING_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]],
}


def test_valid_point_is_accepted() -> None:
    result = validate_geojson_geometry(VALID_POINT)
    assert result == {"valid": True, "geometry_type": "Point", "reason": None}


def test_valid_polygon_is_accepted() -> None:
    result = validate_geojson_geometry(VALID_POLYGON)
    assert result["valid"] is True
    assert result["geometry_type"] == "Polygon"


def test_self_intersecting_polygon_is_rejected() -> None:
    result = validate_geojson_geometry(SELF_INTERSECTING_POLYGON)
    assert result["valid"] is False
    assert result["reason"] is not None


def test_non_geometry_payload_is_rejected() -> None:
    result = validate_geojson_geometry({"not": "a geometry"})
    assert result == {
        "valid": False,
        "geometry_type": None,
        "reason": "not a GeoJSON geometry object",
    }


def test_malformed_geometry_is_rejected_without_raising() -> None:
    result = validate_geojson_geometry({"type": "Point", "coordinates": "not-coordinates"})
    assert result["valid"] is False
