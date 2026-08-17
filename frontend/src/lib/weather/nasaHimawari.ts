/**
 * NASA GIBS Himawari-9 AHI Clean Longwave Infrared (Band 13) - real
 * geostationary satellite cloud imagery, not a numerical model field.
 *
 * This is the "Observed Cloud" source: JMA's Himawari-9 sits at 140.7°E and
 * re-images its full disk (which includes India, toward the western edge)
 * every 10 minutes, day and night (thermal IR, not reflected sunlight, so it
 * keeps working after dark - unlike a visible-light band).
 *
 * All tiling metadata below was read from the real GIBS WMTS
 * GetCapabilities document, then verified against live tile requests
 * (GoogleMapsCompatible_Level6 confirmed as the real max zoom - Level7
 * belongs to a different Himawari band and 404s for this one).
 */

export const HIMAWARI_LAYER = "Himawari_AHI_Band13_Clean_Infrared";
export const HIMAWARI_TILE_MATRIX_SET = "GoogleMapsCompatible_Level6";
export const HIMAWARI_TILE_SIZE = 256;
export const HIMAWARI_NATIVE_MAX_ZOOM = 6;
export const HIMAWARI_FORMAT = "png";
export const HIMAWARI_NOMINAL_RESOLUTION_M = 2000;
export const HIMAWARI_INSTRUMENT = "AHI (Himawari-9)";
export const HIMAWARI_PRODUCT_NAME = "Clean Longwave Infrared (Band 13)";
export const HIMAWARI_ATTRIBUTION = "Imagery: NASA EOSDIS GIBS / JMA Himawari-9 AHI";
export const HIMAWARI_CADENCE_MINUTES = 10;

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** `time` is either "default" (best-available/latest) or an ISO minute-precision timestamp. */
export function himawariTileUrlTemplate(time: string): string {
  return `${GIBS_BASE}/${HIMAWARI_LAYER}/default/${time}/${HIMAWARI_TILE_MATRIX_SET}/{z}/{y}/{x}.${HIMAWARI_FORMAT}`;
}

function floorToStep(date: Date, stepMinutes: number): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / stepMinutes) * stepMinutes);
  return d;
}

function toIsoMinute(date: Date): string {
  return date.toISOString().slice(0, 16) + ":00Z";
}

const PROBE_Z = 4;
const PROBE_X = 11;
const PROBE_Y = 6;

async function tileExists(time: string, signal?: AbortSignal): Promise<boolean> {
  const url = himawariTileUrlTemplate(time)
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

/**
 * Probes real, existing 10-minute timestamps going back from now (newest
 * first), verifying every candidate against a live tile request in parallel
 * and keeping only the ones that actually exist - gaps in the real cadence
 * are skipped, never invented. Returns up to `count` real frames.
 */
export async function recentHimawariFrames(
  count = 12,
  candidateSteps = 30
): Promise<string[]> {
  const start = floorToStep(new Date(), HIMAWARI_CADENCE_MINUTES);
  const candidates = Array.from({ length: candidateSteps }, (_, i) =>
    toIsoMinute(new Date(start.getTime() - i * HIMAWARI_CADENCE_MINUTES * 60_000))
  );
  const checks = await Promise.all(candidates.map((t) => tileExists(t).then((ok) => (ok ? t : null))));
  return checks.filter((t): t is string => t !== null).slice(0, count);
}
