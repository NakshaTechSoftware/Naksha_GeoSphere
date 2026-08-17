/**
 * NASA GIBS VIIRS Land Surface Temperature (Day/Night).
 *
 * Tiling metadata read from the real GIBS WMTS GetCapabilities document
 * (https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&
 * REQUEST=GetCapabilities), not guessed:
 *   - Layer IDs: VIIRS_SNPP_Land_Surface_Temp_Day / _Night (confirmed present;
 *     NOAA-20 LST Day confirmed; NOAA-21 LST Day confirmed as of 2024).
 *   - TileMatrixSet "GoogleMapsCompatible_Level7" -> native maxzoom 7 (lower
 *     than the true-color imagery's Level9/zoom-9 - LST is a coarser derived
 *     science product).
 *   - Format: image/png (NASA renders this as a pre-colorized browse image,
 *     not a raw numeric grid - see note below).
 * Verified against live tile requests: today's date 404s until NASA finishes
 * processing that day's swath; the previous day reliably has real tiles.
 *
 * IMPORTANT: GIBS serves LST as NASA's own pre-colorized PNG "browse image" -
 * there is no raw Kelvin/Celsius value encoded per pixel available through
 * this WMTS endpoint. That means:
 *   - The colour ramp shown is NASA's official one, not a custom one we draw.
 *   - Click-to-inspect cannot report an exact numeric temperature from these
 *     tiles; callers must show "Pixel temperature lookup unavailable" rather
 *     than fabricate a value (getting real numeric values would require a
 *     different NASA delivery path - direct granule access - which is out of
 *     scope here).
 *
 * COVERAGE NOTE: VIIRS is a polar-orbiting sensor with swath gaps. Daily
 * coverage over India is incomplete. This module reports valid tile coverage
 * for the requested date/product so the UI can inform the user.
 */

export type ViirsLstDayNight = "day" | "night";

export interface ViirsLstProductInfo {
  platform: "SNPP" | "NOAA20" | "NOAA21";
  dayNight: ViirsLstDayNight;
  layer: string;
  label: string;
}

export interface ViirsLstCoverageReport {
  product: ViirsLstProductInfo;
  date: string;
  tilesChecked: number;
  tilesValid: number;
  coveragePercent: number;
  indiaBounds: { west: number; south: number; east: number; north: number };
}

// All known VIIRS LST products in GIBS (as of 2024)
export const VIIRS_LST_PRODUCTS: ViirsLstProductInfo[] = [
  { platform: "SNPP", dayNight: "day", layer: "VIIRS_SNPP_Land_Surface_Temp_Day", label: "Suomi NPP Day" },
  { platform: "SNPP", dayNight: "night", layer: "VIIRS_SNPP_Land_Surface_Temp_Night", label: "Suomi NPP Night" },
  { platform: "NOAA20", dayNight: "day", layer: "VIIRS_NOAA20_Land_Surface_Temp_Day", label: "NOAA-20 Day" },
  { platform: "NOAA21", dayNight: "day", layer: "VIIRS_NOAA21_Land_Surface_Temp_Day", label: "NOAA-21 Day" },
  // NOAA-20/21 Night LST not in GIBS as of 2024
];

export const VIIRS_LST_TILE_MATRIX_SET = "GoogleMapsCompatible_Level7";
export const VIIRS_LST_TILE_SIZE = 256;
export const VIIRS_LST_NATIVE_MAX_ZOOM = 7;
export const VIIRS_LST_FORMAT = "png";
export const VIIRS_LST_NOMINAL_RESOLUTION_M = 750;
export const VIIRS_LST_INSTRUMENT = "VIIRS";
export const VIIRS_LST_PRODUCT_NAME = "Land Surface Temperature";
export const VIIRS_LST_ATTRIBUTION = "NASA EOSDIS GIBS / VIIRS Land Surface Temperature";

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export function viirsLstTileUrlTemplate(layer: string, date: string): string {
  // GIBS WMTS path order is {TileMatrix}/{TileRow}/{TileCol} i.e. z/y/x.
  return `${GIBS_BASE}/${layer}/default/${date}/${VIIRS_LST_TILE_MATRIX_SET}/{z}/{y}/{x}.${VIIRS_LST_FORMAT}`;
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// A tile actually over India (lon ~79E, lat ~22N) at native zoom 4 - VIIRS is
// polar-orbiting, so a tile existing elsewhere on Earth doesn't mean India's
// swath is processed; the probe must be over the region this app displays.
const PROBE_Z = 4;
const PROBE_X = 11;
const PROBE_Y = 6;
const FALLBACK_WINDOW_DAYS = 6;

// India bounds in Web Mercator tile coordinates at zoom 4
const INDIA_TILE_BOUNDS_Z4 = {
  minX: 10,
  maxX: 12,
  minY: 5,
  maxY: 7,
};

async function tileExists(layer: string, date: string, signal?: AbortSignal): Promise<boolean> {
  const url = viirsLstTileUrlTemplate(layer, date)
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

export interface ResolvedViirsLst {
  dayNight: ViirsLstDayNight;
  layer: string;
  satelliteLabel: string;
  date: string; // YYYY-MM-DD, the actual date being displayed
  platform: "SNPP" | "NOAA20" | "NOAA21";
  productInfo: ViirsLstProductInfo;
}

const resolvedCache = new Map<string, Promise<ResolvedViirsLst | null>>();

/**
 * Resolves the actual layer + date to display for `dayNight`: tries all
 * available platforms (SNPP, NOAA-20, NOAA-21) for the given day/night,
 * each for today back through `FALLBACK_WINDOW_DAYS` days, and returns the
 * first combination with a real tile over India. Cached per day/night for the
 * session so repeated toggles don't re-probe the network.
 */
export function resolveViirsLst(dayNight: ViirsLstDayNight): Promise<ResolvedViirsLst | null> {
  const cacheKey = dayNight;
  let cached = resolvedCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const candidateDates = Array.from({ length: FALLBACK_WINDOW_DAYS }, (_, i) => isoDateDaysAgo(i));
      const products = VIIRS_LST_PRODUCTS.filter((p) => p.dayNight === dayNight);

      for (const product of products) {
        for (const date of candidateDates) {
          if (await tileExists(product.layer, date)) {
            return {
              dayNight,
              layer: product.layer,
              satelliteLabel: product.label,
              date,
              platform: product.platform,
              productInfo: product,
            };
          }
        }
      }
      return null;
    })();
    resolvedCache.set(cacheKey, cached);
  }
  return cached;
}

/**
 * Checks coverage for a specific product/date over the India tile range.
 * Returns the percentage of tiles that have valid data.
 */
export async function checkViirsLstCoverage(
  product: ViirsLstProductInfo,
  date: string,
  signal?: AbortSignal
): Promise<ViirsLstCoverageReport> {
  const { minX, maxX, minY, maxY } = INDIA_TILE_BOUNDS_Z4;
  let tilesChecked = 0;
  let tilesValid = 0;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tilesChecked++;
      const url = viirsLstTileUrlTemplate(product.layer, date)
        .replace("{z}", String(PROBE_Z))
        .replace("{x}", String(x))
        .replace("{y}", String(y));
      try {
        const res = await fetch(url, { method: "HEAD", signal });
        if (res.ok) tilesValid++;
      } catch {
        // tile not available
      }
    }
  }

  return {
    product,
    date,
    tilesChecked,
    tilesValid,
    coveragePercent: tilesChecked > 0 ? Math.round((tilesValid / tilesChecked) * 100) : 0,
    indiaBounds: { west: 68.0, south: 8.0, east: 97.5, north: 37.5 },
  };
}

/** Every date the prev/next/play controls may step through, newest first. */
export function recentViirsLstDates(count = 6): string[] {
  return Array.from({ length: count }, (_, i) => isoDateDaysAgo(i));
}

/** Checks (without caching) whether `date` has a real tile - used by prev/next date navigation. */
export function probeViirsLstDate(layer: string, date: string, signal?: AbortSignal): Promise<boolean> {
  return tileExists(layer, date, signal);
}

/** True during roughly IST daytime (06:00-18:00), used to pick Day vs Night for Auto mode. */
export function isDaytimeIst(date = new Date()): boolean {
  const istHour = (date.getUTCHours() + 5.5) % 24;
  return istHour >= 6 && istHour < 18;
}