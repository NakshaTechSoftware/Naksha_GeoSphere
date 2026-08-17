/**
 * NASA GIBS VIIRS Corrected Reflectance (True Color) satellite imagery.
 *
 * All tiling metadata below was read from the real GIBS WMTS GetCapabilities
 * document (https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?
 * SERVICE=WMTS&REQUEST=GetCapabilities), not guessed:
 *   - TileMatrixSet "GoogleMapsCompatible_Level9" -> standard Web Mercator
 *     XYZ tiling, 256x256 tiles, 10 zoom levels (0-9, so native maxzoom = 9).
 *   - Format: image/jpeg.
 * Verified against live tile requests: requesting today's date over India
 * returns 404 (the day's swath isn't processed yet); the previous day
 * reliably returns real imagery - hence the today -> yesterday -> two days
 * ago fallback, resolved by probing real tiles rather than assuming.
 */

export type GibsSatelliteId = "NOAA21" | "NOAA20" | "SNPP";

export interface GibsSatelliteProduct {
  id: GibsSatelliteId;
  layer: string;
  satelliteLabel: string;
}

// Priority order per mission: NOAA-21 primary, NOAA-20 then SNPP as fallbacks.
export const GIBS_VIIRS_PRODUCTS: GibsSatelliteProduct[] = [
  { id: "NOAA21", layer: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", satelliteLabel: "NOAA-21" },
  { id: "NOAA20", layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", satelliteLabel: "NOAA-20" },
  { id: "SNPP", layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor", satelliteLabel: "Suomi NPP" },
];

export const GIBS_TILE_MATRIX_SET = "GoogleMapsCompatible_Level9";
export const GIBS_TILE_SIZE = 256;
export const GIBS_NATIVE_MAX_ZOOM = 9; // GoogleMapsCompatible_Level9 => levels 0..9
export const GIBS_FORMAT = "jpeg";
export const GIBS_NOMINAL_RESOLUTION_M = 375;
export const GIBS_INSTRUMENT = "VIIRS";
export const GIBS_PRODUCT_NAME = "Corrected Reflectance (True Color)";
export const GIBS_ATTRIBUTION = "Imagery: NASA EOSDIS GIBS / VIIRS";

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export function gibsTileUrlTemplate(layer: string, date: string): string {
  // MapLibre substitutes {z}/{x}/{y}; GIBS's WMTS path order is
  // {TileMatrix}/{TileRow}/{TileCol} i.e. z/y/x, not z/x/y.
  return `${GIBS_BASE}/${layer}/default/${date}/${GIBS_TILE_MATRIX_SET}/{z}/{y}/{x}.${GIBS_FORMAT}`;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// A low-zoom tile actually covering India (lon ~79E, lat ~22N), used to probe
// real availability. VIIRS is polar-orbiting: "today" is composited swath by
// swath as the satellite passes over each region through the day, so a tile
// existing somewhere on Earth does NOT mean India's swath is processed yet -
// the probe must be over the region this app actually displays.
const PROBE_Z = 4;
const PROBE_X = 11;
const PROBE_Y = 6;

async function tileExists(layer: string, date: string, signal?: AbortSignal): Promise<boolean> {
  const url = gibsTileUrlTemplate(layer, date)
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

export interface ResolvedGibsSatellite {
  product: GibsSatelliteProduct;
  date: string; // YYYY-MM-DD, the actual date being displayed
}

let resolvedPromise: Promise<ResolvedGibsSatellite | null> | null = null;

/**
 * Resolves which VIIRS product + date to display: tries NOAA-21, NOAA-20,
 * then SNPP, each for yesterday / two / three days ago, and returns the
 * first combination with a real tile. Cached for the session (same pattern
 * as resolveWeatherTerrainProvider) so repeated toggles don't re-probe.
 *
 * Deliberately starts from YESTERDAY, not today. VIIRS is a polar orbiter:
 * a given longitude only gets imaged once, during its local daytime pass,
 * and "today" is still in progress everywhere until the day ends UTC - at
 * any given moment roughly half the globe is still waiting for its pass (or
 * is in darkness, where true-color has nothing to show regardless). A full
 * *completed* calendar day, by contrast, has swept every longitude through
 * its daytime pass at least once (~14 orbits/day, each shifted ~25° west,
 * sums to a full 360°), so it's the first date that can honestly be
 * gap-free at a global scale. Verified live: probing "today" mid-UTC-day
 * and using it as one uniform date left large real regions (the whole
 * Americas/Atlantic, still hours from their pass) with no tile at all.
 * The user can still step forward to today via Next/Play if they want the
 * freshest-but-partial view.
 */
export function resolveGibsSatellite(): Promise<ResolvedGibsSatellite | null> {
  if (!resolvedPromise) {
    resolvedPromise = (async () => {
      const candidateDates = [isoDateDaysAgo(1), isoDateDaysAgo(2), isoDateDaysAgo(3)];
      for (const product of GIBS_VIIRS_PRODUCTS) {
        for (const date of candidateDates) {
          if (await tileExists(product.layer, date)) {
            return { product, date };
          }
        }
      }
      return null;
    })();
  }
  return resolvedPromise;
}

/** Clears the cached resolution so the next `resolveGibsSatellite()` call re-probes from
 * scratch - lets the UI offer a retry after a transient failure instead of being stuck
 * on "unavailable" for the rest of the session. */
export function resetGibsSatelliteResolution(): void {
  resolvedPromise = null;
}

/** Every date the animation/prev-next controls may step through, newest first. */
export function recentGibsDates(count = 5): string[] {
  return Array.from({ length: count }, (_, i) => isoDateDaysAgo(i));
}

/** Checks (without caching) whether `date` has a real tile for this product - used by prev/next navigation. */
export function probeGibsDate(layer: string, date: string, signal?: AbortSignal): Promise<boolean> {
  return tileExists(layer, date, signal);
}
