# AI Function Calling — Tool Schemas & Worked Examples

`GET /geoai/tools/definitions` returns this array verbatim (also embedded below for reference — the live endpoint is the source of truth). Pass it straight into an OpenAI/Anthropic-style `tools=[...]` parameter.

```json
[
  {
    "type": "function",
    "function": {
      "name": "reverse_geocode",
      "description": "Convert a latitude/longitude pair into a human-readable address or place name.",
      "parameters": {
        "type": "object",
        "properties": {
          "lat": { "type": "number", "description": "Latitude, WGS84." },
          "lon": { "type": "number", "description": "Longitude, WGS84." }
        },
        "required": ["lat", "lon"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_place",
      "description": "Resolve a place name or address typed by the user into coordinates.",
      "parameters": {
        "type": "object",
        "properties": { "query": { "type": "string", "description": "Free-text place name or address." } },
        "required": ["query"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "find_nearest_place",
      "description": "Find the nearest points of interest of a given category to a location, within a radius, sorted by distance.",
      "parameters": {
        "type": "object",
        "properties": {
          "category": { "type": "string", "enum": ["police_station", "hospital", "school", "atm", "pharmacy"] },
          "latitude": { "type": "number" },
          "longitude": { "type": "number" },
          "radius": { "type": "integer", "description": "Search radius in meters.", "default": 2000 }
        },
        "required": ["category", "latitude", "longitude"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "query_spatial_layer",
      "description": "Answer 'which administrative area contains this point' questions, e.g. which district, taluk, hobli, village, ward, gram panchayat, postal code (PIN code), police jurisdiction, assembly constituency, or parliamentary constituency a coordinate falls inside.",
      "parameters": {
        "type": "object",
        "properties": {
          "layer": { "type": "string", "enum": ["district", "taluk", "hobli", "village", "ward", "gram_panchayat", "postal_code", "police_jurisdiction", "assembly_constituency", "parliamentary_constituency"] },
          "geometry": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": "[longitude, latitude] point to test." },
          "operation": { "type": "string", "enum": ["point_in_polygon", "intersects", "contains", "within"], "default": "point_in_polygon" }
        },
        "required": ["layer", "geometry"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_route",
      "description": "Get driving/walking/cycling directions between two points.",
      "parameters": {
        "type": "object",
        "properties": {
          "origin": { "type": "object", "properties": { "lat": { "type": "number" }, "lon": { "type": "number" } }, "required": ["lat", "lon"] },
          "destination": { "type": "object", "properties": { "lat": { "type": "number" }, "lon": { "type": "number" } }, "required": ["lat", "lon"] },
          "mode": { "type": "string", "enum": ["driving", "walking", "cycling"], "default": "driving" }
        },
        "required": ["origin", "destination"]
      }
    }
  }
]
```

## Worked example — a full round trip

**1. Model emits a tool call** (this is what an OpenAI-style `tool_calls` entry looks like — shown here as the plain JSON your agent runtime hands off):

```json
{
  "name": "find_nearest_place",
  "arguments": {
    "category": "police_station",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "radius": 5000
  }
}
```

**2. Agent runtime forwards it, unmodified, to this service:**

```
POST /geoai/tools/execute
X-API-Key: <key>
Content-Type: application/json

{
  "name": "find_nearest_place",
  "arguments": { "category": "police_station", "latitude": 12.9716, "longitude": 77.5946, "radius": 5000 },
  "session_id": "conv-8f3a1c"
}
```

**3. Service response, handed back to the model as the tool result:**

```json
{
  "status": "success",
  "tool": "find_nearest_place",
  "result": {
    "status": "success",
    "results": [
      {
        "name": "Cubbon Park Police Station",
        "type": "police_station",
        "distance_meters": 210.4,
        "location": { "lat": 12.9784, "lon": 77.5946 },
        "address": "Kasturba Road, Bengaluru",
        "phone": "080-22942222",
        "source": "postgis"
      }
    ],
    "cached": false,
    "source": "postgis"
  }
}
```

**4. Audit log line emitted server-side** (Feature 6 — see `app/core/logging.py`), independent of what the model sees:

```json
{
  "timestamp": "2026-08-27T10:14:02+0000",
  "level": "INFO",
  "logger": "geoai.tool_call",
  "message": "tool_call",
  "tool": "find_nearest_place",
  "session_id": "conv-8f3a1c",
  "input_params": { "name": "find_nearest_place", "arguments": { "category": "police_station", "latitude": 12.9716, "longitude": 77.5946, "radius": 5000 } },
  "latency_ms": 118.4,
  "status": "success"
}
```

## Chaining tools (not automated yet — see the architecture audit's §07)

A "what's this land worth" conversation turn today requires the agent to call, in sequence: `reverse_geocode` → `find_nearest_place` (or a parcel-specific lookup once one exists) → the `/geoai/land-record` and `/geoai/environment` adapters. Nothing in this service currently plans that chain for the model — each call is independent and stateless. If/when that composition becomes a common flow, introduce it as an explicit orchestration layer (e.g. LangGraph) in the *agent runtime*, not inside this adapter service — this service's job stays "one typed, safe call in, one typed result out."
