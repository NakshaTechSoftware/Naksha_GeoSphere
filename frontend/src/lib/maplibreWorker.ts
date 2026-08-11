import * as maplibregl from "maplibre-gl";

/**
 * maplibre-gl v5/v6 runs all GeoJSON parsing in a Web Worker, but derives the worker
 * script URL from `import.meta.url`. Next.js (webpack/turbopack) rewrites `import.meta.url`
 * so that URL points at a chunk path that doesn't exist -> the worker never starts and EVERY
 * GeoJSON source silently fails to load (raster tiles still work, since they load on the
 * main thread). That is why the globe's ocean/land and the Explore page's district/taluk
 * layers all went blank after the v6 upgrade.
 *
 * Fix: point maplibre at a copy of the worker script (plus its `./maplibre-gl-shared.mjs`
 * import) that we ship in `public/maplibre/`. `setWorkerUrl` runs synchronously at module
 * load (before any map or worker pool exists), so GeoJSON sources load reliably.
 *
 * The copies in `public/maplibre/` are generated from `node_modules/maplibre-gl/dist/` by
 * `scripts/sync-maplibre-worker.mjs` (wired into `postinstall` so they always match the
 * installed maplibre version).
 */
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/**
 * Points maplibre's GeoJSON worker at the public-served copy. Must run before any map is
 * created - called from each map entry point, but idempotent so double-invocation is safe.
 * (kept as a function so the import is a consumed export and can never be tree-shaken)
 */
export function configureMaplibreWorker(): void {
  if (typeof window === "undefined") return;
  try {
    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
  } catch (e) {
    // Fall back to maplibre's default worker resolution (used in non-Next.js builds).
    console.warn("[maplibre] could not set worker URL:", e);
  }
}
