# 0004 — Celery + Redis for Background Geospatial Processing

## Status

Accepted

## Context

Clipping, reprojecting, and packaging geospatial datasets (potentially
gigabytes of raster/point-cloud data) can take from seconds to minutes —
far too long to run inside an HTTP request. This work also needs a very
different dependency footprint (GDAL and friends) than the API, and
different scaling behavior (CPU/memory-bound batch jobs vs. low-latency
request handling).

## Decision

A separate `services/worker` container runs Celery, using Redis as both
broker and result backend (Redis is already needed elsewhere in the
stack, so this adds no new infrastructure). Five queues are declared
up front — `default`, `raster`, `vector`, `lidar`, `notifications` — so
future task routing decisions (e.g. isolating LiDAR jobs, which tend to
be the most memory-hungry, onto dedicated worker capacity) don't require
a broker migration later, just a routing rule and possibly a
dedicated worker deployment consuming only that queue.

The worker's base image is the official OSGeo GDAL image
(`ghcr.io/osgeo/gdal:ubuntu-small-3.9.3`), giving it both the GDAL CLI
utilities and Python bindings the future processing pipelines need,
without polluting the API image with that dependency weight.

## Consequences

- The API stays lightweight and fast; anything long-running or
  CPU-heavy is offloaded.
- Queue isolation is available from day one — a future incident where
  LiDAR jobs starve dataset-clipping jobs (or vice versa) is a
  configuration change, not a redesign.
- Tasks are designed to take in-memory data or object-storage keys, never
  raw filesystem paths from external input — see
  `worker/geospatial/validation.py` for the pattern, and
  [SECURITY.md](../SECURITY.md).
- Retry policy, time limits, and `task_acks_late` +
  `task_reject_on_worker_lost` are configured from the start
  (`worker/main.py`) so a crashed worker doesn't silently drop or
  duplicate real dataset-processing jobs later.
