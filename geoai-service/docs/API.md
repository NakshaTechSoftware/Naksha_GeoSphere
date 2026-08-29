# GeoAI Tool Adapter Service — API Reference

Base URL (internal): `http://geoai-service:8000` · Docker-mapped for local dev at `http://localhost:8100`.

All endpoints below (except `GET /health`) require:

```
X-API-Key: <your GEOAI_API_KEYS value>
```

A missing or invalid key returns `401` with `{"status":"error","error_code":"unauthorized",...}`.
Exceeding `RATE_LIMIT_PER_KEY` requests per `RATE_LIMIT_WINDOW_SECONDS` returns `429`.

Interactive docs (Swagger UI) are available at `/docs` when `DOCS_ENABLED=true`; the raw spec is at `/openapi.json` (also exportable via `scripts/export_openapi.py`, see [openapi.json](openapi.json)).

---

## `GET /health`

Public. Liveness check.

```json
{ "status": "ok", "service": "GeoAI Tool Adapter Service", "version": "1.0.0" }
```

---

## `POST /geoai/nearby`

Find the nearest points of interest to a location. PostGIS-first (`ST_DWithin` + `ST_Distance` + GiST index), falls back to MinIO GeoJSON + Shapely when no PostGIS rows exist for that type yet.

**Request**

```json
{ "type": "police_station", "lat": 12.9716, "lon": 77.5946, "radius": 5000, "limit": 10 }
```

| field  | type   | required | notes                                                              |
|--------|--------|----------|---------------------------------------------------------------------|
| type   | string | yes      | `police_station` \| `hospital` \| `school` \| `atm` \| `pharmacy`   |
| lat    | number | yes      | -90..90                                                              |
| lon    | number | yes      | -180..180                                                            |
| radius | int    | no       | meters, default 2000, max 50000                                     |
| limit  | int    | no       | default 10, max 50                                                   |

**Response**

```json
{
  "status": "success",
  "results": [
    {
      "name": "Indiranagar Police Station",
      "type": "police_station",
      "distance_meters": 1800.0,
      "location": { "lat": 12.9784, "lon": 77.6408 },
      "address": null,
      "phone": null,
      "source": "postgis"
    }
  ],
  "cached": false
}
```

Cache key: `nearby:<type>:<lat>:<lon>:<radius>`, TTL `CACHE_TTL_NEARBY_SECONDS`.

---

## `POST /geoai/query-layer`

Answers "which administrative area contains this point" questions. PostGIS-first (`ST_Contains`/`ST_Intersects`), falls back to a MinIO GeoJSON layer + Shapely point-in-polygon.

**Request**

```json
{ "layer": "district", "point": [77.59, 12.97], "operation": "point_in_polygon" }
```

`point` is `[longitude, latitude]` (GeoJSON coordinate order). `layer` ∈ `district | taluk | hobli | village | ward | gram_panchayat | postal_code | police_jurisdiction | assembly_constituency | parliamentary_constituency`. `operation` ∈ `point_in_polygon | intersects | contains | within`.

`postal_code` is a two-step lookup (which district, then that district's own pincode file) rather than a single statewide file like the others — see `app/services/spatial_service.py::_query_postal_code`. `gram_panchayat` is a three-step lookup (district, then that district's own taluk-boundary file, then that taluk's own GP-boundary file) — see `_query_gram_panchayat`.

**Response**

```json
{
  "status": "success",
  "layer": "district",
  "operation": "point_in_polygon",
  "feature": { "name": "Bangalore Urban", "id": "KA_BLR_001", "properties": {} },
  "source": "minio_geojson",
  "cached": false
}
```

Returns `404` (`error_code: "not_found"`) if the point matches nothing.

---

## `POST /geoai/geocode/reverse`

```json
{ "lat": 12.9716, "lon": 77.5946 }
```
→
```json
{ "status": "success", "label": "MG Road, Bengaluru, Karnataka, India", "place_name": "MG Road", "cached": false }
```

## `POST /geoai/geocode/search`

```json
{ "query": "Cubbon Park" }
```
→
```json
{ "status": "success", "results": [{ "label": "Cubbon Park, Bengaluru", "lat": 12.9763, "lon": 77.5929 }] }
```

## `POST /geoai/route`

```json
{ "origin": { "lat": 12.97, "lon": 77.59 }, "destination": { "lat": 12.93, "lon": 77.62 }, "mode": "driving" }
```
→
```json
{ "status": "success", "distance_meters": 8340.2, "duration_seconds": 1120.0, "geometry": { "type": "LineString", "coordinates": [] } }
```

`mode` ∈ `driving | walking | cycling`. Karnataka-only coverage — see [DEPLOYMENT.md](DEPLOYMENT.md) for the OSRM dependency this wraps.

## `POST /geoai/land-record`

```json
{ "district": "Bengaluru Urban", "taluk": "Bengaluru North", "hobli": "Yelahanka", "village": "Attur", "survey": "45", "surnoc": "*", "hissa": "*" }
```
→
```json
{ "status": "success", "owners": [{ "name": "...", "extent": "..." }], "use_case": { "landClassification": "..." } }
```

This wraps a live government-portal scrape — expect multi-second latency; do not assume sub-second responses.

## `POST /geoai/environment`

```json
{ "lat": 12.9716, "lon": 77.5946 }
```
→
```json
{ "status": "success", "weather": { "temperature_c": 27.4 }, "air_quality": { "aqi": 68 } }
```

## `POST /geoai/dataset-layer`

```json
{ "layer": "state-districts", "params": {} }
```
→ raw GeoJSON `FeatureCollection` for that dataset route, wrapped as `{ "status": "success", "feature_collection": {...} }`.

---

## `GET /geoai/tools/definitions`

Returns the OpenAI function-calling compatible schema array for all 5 tools — see [AI_FUNCTION_CALLING.md](AI_FUNCTION_CALLING.md).

## `POST /geoai/tools/execute`

Generic dispatcher: `{"name": "<tool name>", "arguments": {...}, "session_id": "<optional>"}`. Routes to the same service functions the dedicated endpoints above use. Prefer this when your agent runtime already produces OpenAI-style tool calls verbatim; prefer the dedicated endpoints when calling this service directly from other backend code.

```json
{ "status": "success", "tool": "find_nearest_place", "result": { "results": [ ... ], "source": "postgis" } }
```

---

## Error shape

Every error (validation aside, which is FastAPI's standard 422 body) uses:

```json
{ "status": "error", "error_code": "not_found", "message": "No 'district' feature found containing the given point." }
```

| error_code         | status |
|---------------------|--------|
| unauthorized         | 401    |
| rate_limited         | 429    |
| unsupported_type     | 400    |
| not_found            | 404    |
| upstream_error       | 502    |
| unknown_tool         | 500    |
| internal_error       | 500    |
