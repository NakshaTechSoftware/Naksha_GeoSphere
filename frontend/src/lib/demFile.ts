import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Locates the India DEM (SRTM) file used by the terrain tile API.
 *
 * The DEM is a large external asset that is NOT committed to git - it lives in a
 * `DEM_Terrain/` folder next to the project (or is pointed at via INDIA_DEM_PATH /
 * INDIA_DEM_OVERVIEW_PATH). This lookup is shared by the terrain tile route and the
 * availability probe so callers can fail gracefully when the file is missing instead
 * of letting every tile request 500 and breaking the map style.
 */

/** Returns the path of the best DEM file for the given zoom, throwing when absent. */
export function findDemFile(z: number): string {
  const roots = [
    path.resolve(process.cwd(), "..", "DEM_Terrain"),
    path.resolve(process.cwd(), "DEM_Terrain"),
  ];
  const candidates = [
    z <= 8 ? process.env.INDIA_DEM_OVERVIEW_PATH : undefined,
    ...(z <= 8 ? roots.map((root) => path.join(root, "India_DEM_overview.tif")) : []),
    process.env.INDIA_DEM_PATH,
    ...roots.map((root) => path.join(root, "India_DEM.tif")),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("India_DEM.tif was not found; set INDIA_DEM_PATH if it was moved");
  return found;
}

/** True when any usable DEM file exists on this server (full-res or overview). */
export function isDemAvailable(): boolean {
  for (const z of [12, 8]) {
    try {
      findDemFile(z);
      return true;
    } catch {
      // Try the next candidate zoom before giving up.
    }
  }
  return false;
}
