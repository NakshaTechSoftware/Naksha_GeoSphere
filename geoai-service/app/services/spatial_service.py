"""Feature 2 — Spatial layer query ("which district am I in?" etc).

Priority order (per spec): PostGIS table for the layer first, then a
MinIO GeoJSON layer with a Shapely point-in-polygon fallback.

Layer names are restricted to an explicit allow-list — never interpolated
into SQL as a raw table name, and never used to build an arbitrary MinIO
key without going through the same map used elsewhere in the codebase.
"""

from __future__ import annotations

import re

import httpx
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, UnsupportedTypeError
from app.schemas.geoai_models import SpatialFeature
from app.services import geo_service, minio_service
from app.utils.geometry import point_in_polygon_feature


class _LayerSource:
    """Where a layer's fallback data comes from once PostGIS has nothing.

    Exactly one of minio_key / dataset_slug is set. minio_key fetches a
    single statewide file directly from object storage (confirmed to exist
    at that exact path — see police_jurisdiction below); dataset_slug goes
    through the Next.js dataset routes instead (per-admin-unit files).
    """

    __slots__ = ("postgis_table", "minio_key", "dataset_slug")

    def __init__(
        self,
        postgis_table: str | None = None,
        minio_key: str | None = None,
        dataset_slug: str | None = None,
    ) -> None:
        self.postgis_table = postgis_table
        self.minio_key = minio_key
        self.dataset_slug = dataset_slug


# The postgis table is None for every layer today (see the architecture
# audit — boundary layers live in MinIO, not Postgres) but the mapping
# stays explicit so adding a real PostGIS-backed layer later is a one-line
# change here, not a new code path.
LAYER_MAP: dict[str, _LayerSource] = {
    "district": _LayerSource(dataset_slug="state-districts"),
    "taluk": _LayerSource(dataset_slug="district-taluks"),
    "hobli": _LayerSource(dataset_slug="taluk-hoblies"),
    "village": _LayerSource(dataset_slug="hobli-villages"),
    "ward": _LayerSource(dataset_slug="gba-wards"),
    # Confirmed by listing the actual bucket — a single statewide file of
    # police-jurisdiction polygons, not the per-station-folder layout a
    # Next.js dataset route would serve. See nearby_service.py's
    # MINIO_FALLBACK_KEYS for the same file used by find_nearest_place.
    "police_jurisdiction": _LayerSource(
        minio_key="Police Station Boundaries/KARNATAKA_POLICE_STATIONS.geojson"
    ),
    # Confirmed by listing the bucket — single statewide files, 224 and 28
    # features respectively (Karnataka's actual assembly/Lok Sabha seat
    # counts), each with a clean top-level "name" property.
    "assembly_constituency": _LayerSource(
        minio_key="Assembly Constituency Boundaries/India/Karnataka/Assembly_Constituency_Boundary_Karnataka.geojson"
    ),
    "parliamentary_constituency": _LayerSource(
        minio_key="Parliamentary Constituency Boundaries/India/Karnataka/Parliamentary_Constituency_Boundary_Karnataka.geojson"
    ),
}

# postal_code has no single statewide file — pincode boundaries are
# published one file per district (Civic Amenities/.../Districts/<name>/
# <name>_pincode_boundary.geojson), so it needs its own two-step resolver
# (which district, then that district's own file) instead of fitting the
# single-file _LayerSource model above. See _query_postal_code().
_KARNATAKA_DISTRICTS_FILE = "Civic Amenities/India/Karnataka/KARNATAKA_DISTRICTS.geojson"
_PINCODE_DISTRICTS_PREFIX = "Civic Amenities/India/Karnataka/Districts/"

# The pincode dataset's district folder names don't always match the
# district-boundary shapefile's own `dtname` spelling (different source/
# survey year) — this covers the known mismatches after normalization
# (lowercased, non-alphanumeric stripped). Anything not covered here, or
# not represented in the pincode dataset at all (e.g. "Ramanagara" and
# "Bengaluru South" have no dedicated pincode folder as of this data),
# falls through to NotFoundError rather than guessing at a folder.
_DISTRICT_NAME_ALIASES = {
    "davangere": "davanagere",
    "kalaburagi": "kalaburgi",
    "kolar": "kolara",
    "vijayanagar": "vijayanagara",
}

# gram_panchayat has no single statewide file either, and needs one MORE
# step than postal_code: district -> that district's own taluk-boundary
# file -> that taluk's own GP-boundary file. Confirmed by listing the
# bucket: Gram Panchayat Boundaries/India/Karnataka/Districts/<district>/
# <district>_taluk_boundaries.geojson, and .../Taluk_Panchayats/<taluk>/
# <taluk>_gram_panchayat_boundaries.geojson. See _query_gram_panchayat().
_GP_KARNATAKA_DISTRICTS_FILE = "Gram Panchayat Boundaries/India/Karnataka/KARNATAKA_DISTRICTS.geojson"
_GP_DISTRICTS_PREFIX = "Gram Panchayat Boundaries/India/Karnataka/Districts/"

ALL_LAYERS = sorted([*LAYER_MAP, "postal_code", "gram_panchayat"])

# KML-exported layers (assembly/parliamentary constituency) carry a
# "description" property that's a multi-KB HTML table duplicating the
# other properties for a map popup — useless to a tool caller, and
# expensive: this result gets serialized back into the LLM's conversation
# context on every tool call, and a small model's context window is a
# real constraint (see the earlier latency investigation). The gram
# panchayat layer separately leaks a local Windows filesystem path
# ("source_file") from whoever built the dataset — internal, not useful.
_NOISY_PROPERTY_KEYS = {
    "description",
    "extrude",
    "altitudeMode",
    "source_file",
    # The police-jurisdiction file carries internal GIS-admin bookkeeping
    # (a KGIS REST service URL, the source layer's internal name) — not
    # useful to a caller, and prone to getting quoted verbatim by the LLM
    # as if it were a real "more details" link for the user.
    "_source_layer",
    "_source_layer_url",
}

_POSTGIS_OPERATION_SQL = {
    "point_in_polygon": "ST_Contains",
    "within": "ST_Contains",
    "contains": "ST_Contains",
    "intersects": "ST_Intersects",
}


async def query_layer(
    session: AsyncSession, layer: str, lon: float, lat: float, operation: str
) -> tuple[SpatialFeature | None, str]:
    if layer == "postal_code":
        feature = await _query_postal_code(lon, lat, operation)
        if feature is None:
            raise NotFoundError("No postal code boundary found containing the given point.")
        return feature, "minio_geojson"

    if layer == "gram_panchayat":
        feature = _query_gram_panchayat(lon, lat, operation)
        if feature is None:
            raise NotFoundError("No gram panchayat boundary found containing the given point.")
        return feature, "minio_geojson"

    if layer not in LAYER_MAP:
        raise UnsupportedTypeError(f"Unsupported layer: '{layer}'. Supported layers: {ALL_LAYERS}")

    source = LAYER_MAP[layer]

    if source.postgis_table is not None:
        feature = await _query_postgis(session, source.postgis_table, lon, lat, operation)
        if feature is not None:
            return feature, "postgis"

    if source.minio_key is not None:
        feature_collection = minio_service.get_geojson_cached(source.minio_key)
    else:
        feature_collection = await geo_service.get_dataset_layer(source.dataset_slug, {})

    feature = _match_feature(feature_collection, lon, lat, operation)
    if feature is None:
        raise NotFoundError(f"No '{layer}' feature found containing the given point.")
    return feature, "minio_geojson"


async def _query_postgis(
    session: AsyncSession, table_name: str, lon: float, lat: float, operation: str
) -> SpatialFeature | None:
    sql_fn = _POSTGIS_OPERATION_SQL[operation]
    # table_name only ever comes from LAYER_MAP above, never from caller input.
    stmt = text(
        f"""
        SELECT name, id::text AS id
        FROM {table_name}
        WHERE {sql_fn}(geometry, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
        LIMIT 1
        """
    ).bindparams(bindparam("lon"), bindparam("lat"))
    row = (await session.execute(stmt, {"lon": lon, "lat": lat})).first()
    if row is None:
        return None
    return SpatialFeature(name=row.name, id=row.id, properties={})


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


async def _query_postal_code(lon: float, lat: float, operation: str) -> SpatialFeature | None:
    """Which district contains the point, then that district's own pincode file.

    The pincode boundary data itself carries no locality/area name (only
    pin_code + district — confirmed by inspecting the source files), so a
    "your postal code is 560018" answer with no area name reads as
    incomplete. Enriching with a reverse-geocoded area name here (one extra
    call, only on a successful match) is more reliable than asking the
    small local model to orchestrate a second, separate reverse_geocode
    tool call itself on top of this one.
    """
    districts = minio_service.get_geojson_cached(_KARNATAKA_DISTRICTS_FILE)
    district_feature = point_in_polygon_feature(districts, lat, lon, operation)
    if district_feature is None:
        return None
    dtname = district_feature.get("properties", {}).get("dtname")
    if not dtname:
        return None

    normalized = _normalize_name(dtname)
    normalized = _DISTRICT_NAME_ALIASES.get(normalized, normalized)

    folder_names = minio_service.list_folder_names_cached(_PINCODE_DISTRICTS_PREFIX)
    folder = next((f for f in folder_names if _normalize_name(f) == normalized), None)
    if folder is None:
        return None

    pincode_key = f"{_PINCODE_DISTRICTS_PREFIX}{folder}/{folder}_pincode_boundary.geojson"
    pincode_data = minio_service.get_geojson_cached(pincode_key)
    matched = point_in_polygon_feature(pincode_data, lat, lon, operation)
    if matched is None:
        return None
    props = dict(matched.get("properties", {}))
    pin_code = props.get("pin_code") or props.get("pincode") or props.get("PIN_CODE")

    if pin_code:
        area = await _lookup_pincode_area(str(pin_code))
        if area:
            props["area"] = area["name"]
            if area.get("district"):
                props["postal_district"] = area["district"]
            if area.get("state"):
                props["state"] = area["state"]
        else:
            # Official lookup failed/rate-limited - reverse geocoding gives
            # a real (if less "canonical") locality name rather than nothing.
            try:
                geocode = await geo_service.reverse_geocode(lat, lon)
                if geocode.get("place_name"):
                    props["area"] = geocode["place_name"]
            except Exception:
                pass  # area enrichment is best-effort - the pincode match itself still stands

    return SpatialFeature(name=str(pin_code) if pin_code else None, id=str(pin_code or ""), properties=props)


_pincode_area_cache: dict[str, dict[str, str] | None] = {}


async def _lookup_pincode_area(pin_code: str) -> dict[str, str] | None:
    """The official India Post PIN-to-post-office-name mapping.

    This is the actual source of "PIN code 560018 belongs to Chamarajpet" —
    the answer a Google search gives — which is a different (and for this
    purpose more correct) thing than a reverse-geocoded street/ward name:
    postal areas are named after their post office, not the OSM admin
    boundary the coordinate happens to fall inside.

    Cached indefinitely (in-process) - a PIN code's post office name doesn't
    change on any timescale that matters here, so there's no reason to pay
    for a fresh network call to a third-party API on every request.
    """
    if pin_code in _pincode_area_cache:
        return _pincode_area_cache[pin_code]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.postalpincode.in/pincode/{pin_code}")
            resp.raise_for_status()
            data = resp.json()
        result = data[0] if data else None
        post_offices = (result or {}).get("PostOffice") or []
        office = post_offices[0] if post_offices and result.get("Status") == "Success" else None
        name = office.get("Name") if office else None
        if name:
            # India Post often appends "(City)" to the office name, e.g.
            # "Chamrajpet (Bangalore)" — redundant once combined with the
            # district/state, and reads awkwardly in a sentence.
            name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
        area = (
            {"name": name, "district": office.get("District"), "state": office.get("State")}
            if name
            else None
        )
        _pincode_area_cache[pin_code] = area  # cache the real "not found" case too - stable fact
        return area
    except Exception:
        return None  # network/parse failure - don't cache, worth retrying next time


def _query_gram_panchayat(lon: float, lat: float, operation: str) -> SpatialFeature | None:
    """District -> that district's taluk-boundary file -> that taluk's own GP file.

    Uses the same district-name aliasing as postal_code (this dataset has
    the same folder-vs-dtname spelling mismatches, confirmed by listing the
    bucket) plus a second, analogous fuzzy match to find the taluk's own
    subfolder under Taluk_Panchayats/.
    """
    districts = minio_service.get_geojson_cached(_GP_KARNATAKA_DISTRICTS_FILE)
    district_feature = point_in_polygon_feature(districts, lat, lon, operation)
    if district_feature is None:
        return None
    dtname = district_feature.get("properties", {}).get("dtname")
    if not dtname:
        return None

    normalized_district = _DISTRICT_NAME_ALIASES.get(_normalize_name(dtname), _normalize_name(dtname))
    district_folders = minio_service.list_folder_names_cached(_GP_DISTRICTS_PREFIX)
    district_folder = next(
        (f for f in district_folders if _normalize_name(f) == normalized_district), None
    )
    if district_folder is None:
        return None

    taluk_key = f"{_GP_DISTRICTS_PREFIX}{district_folder}/{district_folder}_taluk_boundaries.geojson"
    taluk_data = minio_service.get_geojson_cached(taluk_key)
    taluk_feature = point_in_polygon_feature(taluk_data, lat, lon, operation)
    if taluk_feature is None:
        return None
    taluk_name = taluk_feature.get("properties", {}).get("taluk_panchayat")
    if not taluk_name:
        return None

    taluk_panchayats_prefix = f"{_GP_DISTRICTS_PREFIX}{district_folder}/Taluk_Panchayats/"
    taluk_folders = minio_service.list_folder_names_cached(taluk_panchayats_prefix)
    taluk_folder = next(
        (f for f in taluk_folders if _normalize_name(f) == _normalize_name(taluk_name)), None
    )
    if taluk_folder is None:
        return None

    gp_key = f"{taluk_panchayats_prefix}{taluk_folder}/{taluk_folder}_gram_panchayat_boundaries.geojson"
    gp_data = minio_service.get_geojson_cached(gp_key)
    matched = point_in_polygon_feature(gp_data, lat, lon, operation)
    if matched is None:
        return None
    raw_props = matched.get("properties", {})
    props = {k: v for k, v in raw_props.items() if k not in _NOISY_PROPERTY_KEYS}
    gp_name = props.get("gram_panchayat")
    return SpatialFeature(name=gp_name, id=str(gp_name or ""), properties=props)


def _match_feature(
    feature_collection: dict, lon: float, lat: float, operation: str
) -> SpatialFeature | None:
    matched = point_in_polygon_feature(feature_collection, lat, lon, operation)
    if matched is None:
        return None
    raw_props = matched.get("properties", {})
    props = {k: v for k, v in raw_props.items() if k not in _NOISY_PROPERTY_KEYS}
    # Real-world property keys vary a lot by source layer (e.g. the police
    # jurisdiction file's station name is "_police_station"/"PS_BOUNDName",
    # not "name") — the substring match below covers both, since ".lower()"
    # of either still contains "name".
    name = next(
        (props[k] for k in props if isinstance(props[k], str) and "name" in k.lower()),
        None,
    )
    return SpatialFeature(name=name, id=str(props.get("id") or props.get("ID") or ""), properties=props)
