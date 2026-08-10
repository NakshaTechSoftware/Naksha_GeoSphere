# GEODATA_SOURCES

All geographic geometry used by the `geosphere-globe-workflow` prototype is **real,
properly licensed administrative boundary data**, stored locally in `public/geodata/`.
Nothing depends on an external boundary API at runtime.

## Files

| File | Contents | Source |
| --- | --- | --- |
| `india-boundary.geojson` | India national outline (dissolved from state polygons, simplified to ~56 KB for the subtle globe outline) | Derived from `india-states.geojson` |
| `india-states.geojson` | 37 Indian states / union territories with `st_nm` (state name) attributes | Derived from the project's existing `frontend/public/data/india_states.geojson` |
| `karnataka-boundary.geojson` | Karnataka state boundary (extracted MultiPolygon) | Derived from `india-states.geojson` |

## Primary source

The primary source file already shipped inside the Naksha GeoSphere repository:

```
frontend/public/data/india_states.geojson
```

- **Content:** All-India state/union-territory boundaries (37 features), with `st_nm`,
  `st_code`, `year`, and `layer` attributes.
- **Provenance:** The repository's existing Karnataka/India boundary data is derived from
  official government survey datasets (KGIS Karnataka / Survey of India state-level
  administrative boundaries). See `docs/GEOSPATIAL_DATA_ARCHITECTURE.md` and
  `docs/GEOSPATIAL_STANDARDS.md` in the main repository for the full sourcing policy.

## Derivation

`scripts/prepare-geodata.mjs` (run once) does:

1. Reads the primary `india_states.geojson`.
2. Extracts Karnataka into `karnataka-boundary.geojson`.
3. Dissolves all state polygons (Turf `union`) into `india-boundary.geojson`.
4. Simplifies the India outline for lightweight globe rendering (kept very subtle).

The generated files are committed so the prototype needs **no network access** to render
geography.

## Location coordinates

City centres in `src/data/locations.ts` are real, standard geographic references:

| City | Longitude | Latitude | Reference |
| --- | --- | --- | --- |
| Bengaluru | 77.5946 | 12.9716 | Bengaluru city centre (MG Road / city centroid) |
| Mysuru | 76.6394 | 12.2958 | Mysuru city centre |
| Chikkamagaluru | 75.7705 | 13.3161 | Chikkamagaluru town centre |
| Mangaluru | 74.8562 | 12.9141 | Mangaluru city centre |
| Hubballi-Dharwad | 75.1239 | 15.3647 | Hubballi-Dharwad municipal centre |

## Basemap tiles

The demo may optionally load a raster/vector basemap via `VITE_MAP_STYLE_URL` /
`VITE_MAP_ACCESS_TOKEN` (see `.env.example`). **Demo tiles are NOT the final commercial
basemap** — the production deployment will use the platform's licensed data sources.
If no style URL is configured (or tiles fail), the prototype renders a local
pale-blue geospatial grid + the simplified real geography, so the workflow animation
never shows a blank rectangle.

## Disputed boundaries

This prototype only highlights the **India national outline and Karnataka state
boundary**, using the same geometry already present in the main product. It does not
render or assert disputed international/regional boundaries.
