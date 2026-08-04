# 0002 — PostgreSQL + PostGIS as the Primary Database

## Status

Accepted

## Context

The marketplace's core entities (datasets, AOIs, cadastral/administrative
boundaries) are inherently spatial. We need a database that can store
geometry natively, index it efficiently, and run spatial predicates
(intersects, contains, area) in the database rather than pulling
everything into application code.

## Decision

PostgreSQL with the PostGIS extension is the system of record, with
pgcrypto also enabled for secure identifier generation. Both are enabled
in the very first Alembic migration
(`0001_enable_postgis_pgcrypto.py`), before any marketplace schema
exists, so every future migration can assume they're present.

Locally, `postgis/postgis:16-3.4` (a pinned image bundling PostgreSQL 16
+ PostGIS 3.4) runs in Docker. In production, any managed PostgreSQL
offering with PostGIS support is compatible — no code depends on
self-hosting.

## Consequences

- Spatial queries (bounding-box search, AOI intersection, area
  calculation) can be pushed to the database, which is both faster and
  keeps geometry logic in one place.
- Every future module with a spatial column follows the conventions in
  [GEOSPATIAL_STANDARDS.md](../GEOSPATIAL_STANDARDS.md) (explicit SRID,
  GiST index, EPSG:4326 for interchange, a projected CRS for area math).
- Choosing a managed Postgres provider for production must confirm
  PostGIS availability — not all managed "PostgreSQL" offerings enable
  it by default.
