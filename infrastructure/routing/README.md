# Routing (turn-by-turn directions)

Backs the app's "Directions"/navigation feature with
[OSRM](https://project-osrm.org/) (Open Source Routing Machine), self-hosted
so live turn-by-turn (continuous re-routing while moving) has no rate limit
and no cost. Public routing APIs (OSRM's own demo server, GraphHopper's free
tier) explicitly disallow that request pattern in production use, which is
why this isn't just a hosted API call the way `/api/geocode` is.

## Coverage

Karnataka only (`karnataka-latest.osm.pbf` from
[download.openstreetmap.fr](https://download.openstreetmap.fr/extracts/asia/india/)'s
state-split India extracts), matching the rest of the app's data scope.
Routes crossing into a neighboring state will fail or come back empty.

## Travel modes

Three modes, matching Google's car/walk/bike tabs - driving, walking,
cycling. OSRM serves exactly one profile per running `osrm-routed`
instance, so each mode is a **separate dataset and a separate Compose
service** (`osrm-driving`, `osrm-walking`, `osrm-cycling`), not a runtime
flag on a shared one. All three are built from the same Karnataka PBF via
OSRM's bundled `car.lua`/`foot.lua`/`bicycle.lua` profiles.

## Where it runs

There's no separate app-compute server yet (see the main
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) - only storage is split out
today, onto the machine documented in
[infrastructure/storage-server/](../storage-server/)). Until one exists, the
three `osrm-*` services run as normal Compose services alongside
`web`/`api`/`worker` (see [compose.dev.yaml](../../compose.dev.yaml)), i.e.
wherever the rest of the dev stack is currently running - not on the storage
server, which is intentionally storage-only.

## Rebuilding the data

The `.osrm.*` files under `data/{driving,walking,cycling}/` (gitignored -
derived, several-hundred-MB each) are prebuilt offline, not generated at
container start. Rebuild all three with:

```bash
bash infrastructure/routing/build.sh
```

This downloads the Karnataka OSM extract (~130MB) once, then for each mode
runs OSRM's standard three-stage preprocessing pipeline (`osrm-extract` with
that mode's bundled profile, `osrm-partition`, `osrm-customize`) via the
`ghcr.io/project-osrm/osrm-backend` image - a few minutes per mode on a
normal laptop. Re-run it whenever the underlying OSM data needs refreshing;
there's no incremental update, it's a full rebuild each time.

Then bring the services up:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d osrm-driving osrm-walking osrm-cycling
```

## Using it

Each `osrm-routed` instance speaks the standard
[OSRM HTTP API](http://project-osrm.org/docs/v5.24.0/api/):

```
GET /route/v1/{driving|walking|cycling}/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson&steps=true
```

Reachable from the host (dev port mapping) at `http://localhost:5001`
(driving), `:5002` (walking), `:5003` (cycling), or from other containers on
`naksha-network` at `http://osrm-driving:5000` /
`http://osrm-walking:5000` / `http://osrm-cycling:5000`. The frontend
doesn't call these directly - see `/api/routing?mode=driving|walking|cycling`
in the Next.js app, which proxies to the right one server-side (consistent
with how `/api/geocode` and the MinIO dataset routes work, and keeps the
internal service addresses out of the browser).

## Note on the Docker image

The official `osrm/osrm-backend` image on Docker Hub hasn't been updated
since 2021 (still on v5.25). The project has since moved active image
publishing to GitHub Container Registry:
`ghcr.io/project-osrm/osrm-backend` (v6.0.0 pinned here) - use that, not the
Docker Hub one.
