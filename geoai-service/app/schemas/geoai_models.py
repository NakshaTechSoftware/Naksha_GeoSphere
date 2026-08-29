"""Pydantic v2 request/response models for every /geoai/* endpoint.

These are the only shapes the AI agent ever sees — no ORM object, MinIO
key, or internal URL is ever serialized into one of these.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

PoiType = Literal["police_station", "hospital", "school", "atm", "pharmacy"]
SpatialOperation = Literal["point_in_polygon", "intersects", "contains", "within"]
TravelMode = Literal["driving", "walking", "cycling"]


class LatLon(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


# ---------------------------------------------------------------------------
# Feature 1 — Nearby search
# ---------------------------------------------------------------------------


class NearbyRequest(BaseModel):
    type: PoiType
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radius: int = Field(default=2000, gt=0, le=50_000, description="Search radius in meters.")
    limit: int = Field(default=10, gt=0, le=50)


class NearbyResultItem(BaseModel):
    name: str
    type: PoiType
    distance_meters: float
    location: LatLon
    address: str | None = None
    phone: str | None = None
    source: Literal["postgis", "minio_geojson"]


class NearbyResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    results: list[NearbyResultItem]
    cached: bool = False


# ---------------------------------------------------------------------------
# Feature 2 — Spatial layer query
# ---------------------------------------------------------------------------


class SpatialQueryRequest(BaseModel):
    layer: str = Field(
        ...,
        description=(
            'e.g. "district", "taluk", "hobli", "village", "ward", "gram_panchayat", '
            '"postal_code", "police_jurisdiction", "assembly_constituency", '
            '"parliamentary_constituency"'
        ),
    )
    point: tuple[float, float] = Field(..., description="[lon, lat], matches GeoJSON coordinate order")
    operation: SpatialOperation = "point_in_polygon"


class SpatialFeature(BaseModel):
    name: str | None = None
    id: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class SpatialQueryResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    layer: str
    operation: SpatialOperation
    feature: SpatialFeature | None = None
    source: Literal["postgis", "minio_geojson"] | None = None
    cached: bool = False


# ---------------------------------------------------------------------------
# GeoSphere adapters (Feature 8) — geocode / route / land record / environment
# ---------------------------------------------------------------------------


class ReverseGeocodeRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class ReverseGeocodeResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    label: str | None = None
    place_name: str | None = None
    cached: bool = False


class SearchPlaceRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)


class PlaceResult(BaseModel):
    label: str
    lat: float
    lon: float


class SearchPlaceResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    results: list[PlaceResult]


class RouteRequest(BaseModel):
    origin: LatLon
    destination: LatLon
    mode: TravelMode = "driving"


class RouteResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    distance_meters: float | None = None
    duration_seconds: float | None = None
    geometry: dict[str, Any] | None = Field(default=None, description="GeoJSON LineString")


class LandRecordRequest(BaseModel):
    district: str
    taluk: str
    hobli: str
    village: str
    survey: str
    surnoc: str = "*"
    hissa: str = "*"


class LandRecordResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    owners: list[dict[str, Any]] = Field(default_factory=list)
    use_case: dict[str, Any] | None = None


class EnvironmentSnapshotRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)


class EnvironmentSnapshotResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    weather: dict[str, Any] | None = None
    air_quality: dict[str, Any] | None = None


class DatasetLayerRequest(BaseModel):
    layer: str
    params: dict[str, str] = Field(default_factory=dict)


class DatasetLayerResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    feature_collection: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Feature 3 — AI tool dispatch
# ---------------------------------------------------------------------------

ToolName = Literal[
    "reverse_geocode",
    "search_place",
    "find_nearest_place",
    "query_spatial_layer",
    "get_route",
]


class ToolExecuteRequest(BaseModel):
    name: ToolName
    arguments: dict[str, Any] = Field(default_factory=dict)
    session_id: str | None = Field(
        default=None, description="Caller-supplied conversation/session id, for audit logging."
    )


class ToolExecuteResponse(BaseModel):
    status: Literal["success", "error"] = "success"
    tool: ToolName
    result: dict[str, Any] | None = None
    error: str | None = None


class ErrorResponse(BaseModel):
    status: Literal["error"] = "error"
    error_code: str
    message: str
