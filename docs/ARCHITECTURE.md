# Architecture

## 1. System Context

Naksha GeoSphere is a geospatial data marketplace. A user searches a
location, previews raster/vector datasets on a map, draws an Area of
Interest (AOI), gets a price, buys the clipped dataset, and downloads it
securely. This document describes the **engineering foundation** — the
containers, data flow, and design decisions this product will be built on.

```
                              ┌───────────────────┐
                              │      Browser        │
                              └─────────┬──────────┘
                                        │ HTTPS
                              ┌─────────▼──────────┐
                              │   apps/web (Next.js) │
                              └─────────┬──────────┘
                                        │ REST (/api/v1)
                              ┌─────────▼──────────┐
                              │  services/api (FastAPI) │
                              └───┬─────────┬──────┬──┘
                                  │         │      │
                     ┌────────────▼──┐ ┌────▼───┐ ┌▼─────────────┐
                     │ PostgreSQL/    │ │ Redis  │ │ MinIO / S3   │
                     │ PostGIS        │ │        │ │ object store │
                     └────────────────┘ └───┬────┘ └──────┬───────┘
                                             │             │
                                   ┌─────────▼─────────────▼──┐
                                   │  services/worker (Celery)  │
                                   └────────────────────────────┘
```

## 2. Container-Level Architecture

| Container | Image / build | Responsibility |
|---|---|---|
| `web` | `apps/web/Dockerfile` (Next.js) | Renders the UI, calls the API, never talks to Postgres/Redis/MinIO directly |
| `api` | `services/api/Dockerfile` (FastAPI) | The only component with database credentials and internal service access; owns all business logic |
| `worker` | `services/worker/Dockerfile` (Celery) | Executes background/long-running geospatial jobs off the request path |
| `postgres` | `postgis/postgis:16-3.4` | System of record; PostGIS for spatial types/queries, pgcrypto for secure identifiers |
| `redis` | `redis:7.4.1-alpine` | Celery broker + result backend |
| `minio` | `minio/minio:RELEASE.2024-12-18T13-15-44Z` | S3-compatible object storage (dev); private buckets only |
| `minio-init` | `minio/mc:RELEASE.2024-12-13T22-19-27Z` | One-shot: creates required buckets idempotently, then exits |
| `mailpit` | `axllent/mailpit:v1.21.5` | Local-only SMTP capture for future transactional email (dev only) |

## 3. Responsibilities

- **web** — presentation only. Reads `NEXT_PUBLIC_API_URL` and renders
  server/client components. Holds no credentials.
- **api** — the modular monolith. All domain logic lives under
  `app/modules/<domain>/` (currently placeholders — see §6). Owns the
  database connection, Redis connection (for Celery task dispatch, once
  wired), and the object-storage client.
- **worker** — consumes Celery tasks from Redis-backed queues
  (`default`, `raster`, `vector`, `lidar`, `notifications`). Has the
  GDAL/rasterio/GeoPandas/Shapely/PyProj/Fiona toolchain the API does
  not need.
- **postgres** — single source of truth. PostGIS and pgcrypto are
  enabled by the first Alembic migration.
- **redis** — purely infrastructure; no application data is the
  authoritative copy of anything here.
- **minio** — object storage for source datasets, generated previews,
  and order output. No object is ever served from a public URL — see
  §5.

## 4. Data Flow (today)

The only end-to-end flow implemented in this phase is a health check:

1. Browser loads `web`, which client-side fetches `GET /api/v1/health`.
2. `api` concurrently checks Postgres/PostGIS, Redis, and MinIO bucket
   presence, and returns an aggregated status.
3. `web` renders a status card per dependency, and degrades gracefully
   (a distinct "unavailable" state, not a crash) if `api` itself is
   unreachable.

## 5. Future Flow — AOI Purchase (not implemented yet)

1. User searches a location; `web` queries a future `catalog` endpoint
   for datasets intersecting the map viewport.
2. User draws an AOI; `web` sends the geometry to a future `pricing`
   endpoint, which computes area (in an appropriate projected CRS — see
   [GEOSPATIAL_STANDARDS.md](GEOSPATIAL_STANDARDS.md)) and price.
3. User checks out; `orders` and `payments` modules create an order
   record and (via a payment provider webhook, validated per
   [SECURITY.md](SECURITY.md)) mark it paid.
4. `api` enqueues a `processing` task (routed to the `raster` or
   `vector` queue depending on dataset type) with the order ID and AOI
   geometry — never a raw filesystem path.
5. `worker` clips/reprojects/packages the dataset with
   GDAL/rasterio/GeoPandas, uploads the result to the
   `geosphere-order-output` bucket, and updates order status.

## 6. Future Flow — Secure Download (not implemented yet)

1. User requests their completed order's download from `web`.
2. `api` verifies the requesting user owns the order, then asks the
   object-storage client for a **short-lived, pre-signed URL**
   (`SIGNED_URL_EXPIRY_SECONDS`, default 900s) scoped to that one
   object in `geosphere-order-output`.
3. The browser downloads directly from object storage using that URL.
   No object in any bucket is ever public, and no permanent/unsigned
   URL is issued — see [docs/SECURITY.md](SECURITY.md).

## 7. Why a Modular Monolith (for now)

See [decisions/0001-modular-monolith.md](decisions/0001-modular-monolith.md)
for the full rationale. In short: at this stage, splitting into services
would add operational overhead (more containers, more network hops, more
deployment surface) without a corresponding benefit — there is no team
scaling problem or independent-deploy requirement yet, and domain
boundaries are still being discovered. `app/modules/<domain>/` gives each
future domain its own directory (and, later, its own router/service/model
layer) so extraction is a matter of moving a directory and standing up a
new deployment target — not a rewrite.

## 8. Boundaries for Future Service Extraction

The module layout is deliberately service-shaped:

- Each module under `app/modules/` should stay free of direct imports
  from other modules' internals — talk through a module's public
  functions/schemas only, the same discipline you'd want across a
  network boundary anyway.
- `processing` (raster/vector/LiDAR clipping) is the most likely first
  extraction candidate — it's already a separate container (`worker`)
  with its own dependency footprint (GDAL) that the API doesn't share.
- `payments` is a strong second candidate once PCI-relevant isolation
  matters.
- Extraction, when it happens, should be driven by a real constraint
  (team ownership, independent scaling, differing reliability
  requirements) — not done speculatively.
