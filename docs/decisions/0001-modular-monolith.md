# 0001 — Start as a Modular Monolith, Not Microservices

## Status

Accepted

## Context

Naksha GeoSphere will eventually have many domains: authentication,
catalog, AOI/pricing, orders, payments, processing, downloads, licensing,
notifications, administration, audit. It would be possible to give each
of these its own service and deployment from day one.

At this stage there is no team-scaling pressure (one team), no proven
need to deploy domains independently, and the domain boundaries
themselves are still being discovered — splitting them into separate
services now would mean guessing at boundaries that are expensive to get
wrong (a network call is much harder to undo than a function call).

## Decision

`services/api` is a single FastAPI application. Each domain gets its own
directory under `app/modules/<domain>/` with (eventually) its own
router, schemas, services, and models. Modules must only interact with
each other through their public interface (router/schemas/service), not
by reaching into each other's internals — the same discipline a network
boundary would force, without paying for the network boundary yet.

The one exception already made: `services/worker` is a separate
container. Background geospatial processing has a fundamentally
different dependency footprint (GDAL, rasterio, GeoPandas — none of
which the request/response API needs) and different scaling
characteristics (CPU/memory-bound batch jobs vs. low-latency requests),
so it earns its separation from the start.

## Consequences

- Faster iteration now: one deployable, one set of migrations, one test
  suite to run.
- Extraction later is cheaper because the module boundary already
  exists as a directory boundary — moving `app/modules/processing/` into
  its own service is a refactor, not an archaeology project.
- Risk: without discipline, modules can still couple to each other
  informally (shared imports). Code review should treat cross-module
  internal imports as a smell.
- We will revisit this decision when a concrete constraint appears —
  e.g. `payments` needing stricter isolation, or a team split — not on a
  fixed timeline.
