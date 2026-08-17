/**
 * NASA GIBS MODIS Terra NDVI (Normalized Difference Vegetation Index),
 * 8-day composite.
 *
 * Same GIBS WMTS mechanism as ../weather/nasaGibs.ts (true-color satellite):
 *   - TileMatrixSet "GoogleMapsCompatible_Level9" -> standard Web Mercator
 *     XYZ tiling, 256x256 tiles, native maxzoom = 9.
 *   - Format: image/png (GIBS serves this layer pre-colorized - brown/red
 *     for sparse vegetation through green for dense - so the frontend does
 *     not need its own colormap, same as the true-color satellite layer).
 * Verified against live tile requests: unlike the daily true-color layer,
 * NDVI is an 8-day composite, so any date within a composite period returns
 * the same tile; recent periods can still lag a few days behind processing,
 * hence the same probe-backwards approach as nasaGibs.ts rather than
 * assuming "today" resolves.
 */

export const NDVI_LAYER = "MODIS_Terra_NDVI_8Day";
export const NDVI_TILE_MATRIX_SET = "GoogleMapsCompatible_Level9";
export const NDVI_TILE_SIZE = 256;
export const NDVI_NATIVE_MAX_ZOOM = 9;
export const NDVI_FORMAT = "png";
export const NDVI_NOMINAL_RESOLUTION_M = 250;
export const NDVI_INSTRUMENT = "MODIS (Terra)";
export const NDVI_PRODUCT_NAME = "Vegetation Index (NDVI), 8-Day";
export const NDVI_ATTRIBUTION = "Imagery: NASA EOSDIS GIBS / MODIS Terra NDVI";

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export function ndviTileUrlTemplate(date: string): string {
  // MapLibre substitutes {z}/{x}/{y}; GIBS's WMTS path order is
  // {TileMatrix}/{TileRow}/{TileCol} i.e. z/y/x, not z/x/y.
  return `${GIBS_BASE}/${NDVI_LAYER}/default/${date}/${NDVI_TILE_MATRIX_SET}/{z}/{y}/{x}.${NDVI_FORMAT}`;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// A low-zoom tile actually covering India, used to probe real availability.
const PROBE_Z = 4;
const PROBE_X = 11;
const PROBE_Y = 6;

async function tileExists(date: string, signal?: AbortSignal): Promise<boolean> {
  const url = ndviTileUrlTemplate(date)
    .replace("{z}", String(PROBE_Z))
    .replace("{x}", String(PROBE_X))
    .replace("{y}", String(PROBE_Y));
  try {
    const res = await fetch(url, { method: "GET", signal });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ResolvedNdvi {
  date: string; // YYYY-MM-DD, the actual composite-period date being displayed
}

let resolvedPromise: Promise<ResolvedNdvi | null> | null = null;

/**
 * Resolves which composite date to display: probes today back through the
 * last ~40 days (covers slow-to-publish 8-day periods) and returns the
 * first one with a real tile. Cached for the session so repeated toggles
 * don't re-probe; call `resetNdviResolution()` to force a retry (e.g. after
 * a prior resolution failed and the user wants to try again).
 */
export function resolveNdvi(): Promise<ResolvedNdvi | null> {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      for (let daysAgo = 0; daysAgo <= 40; daysAgo++) {
        const date = isoDateDaysAgo(daysAgo);
        if (await tileExists(date)) {
          return { date };
        }
      }
      return null;
    })();
  }
  return resolvedPromise;
}

/** Clears the cached resolution so the next `resolveNdvi()` call re-probes from scratch. */
export function resetNdviResolution(): void {
  resolvedPromise = null;
}
