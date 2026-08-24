/**
 * NASA GIBS IMERG (Integrated Multi-satellitE Retrievals for GPM) 30-minute
 * near-real-time precipitation rate - real satellite-derived precipitation
 * observation, not a numerical model forecast.
 *
 * This is the "Observed Rain" source. GPM IMERG NRT combines multiple
 * passive-microwave and IR satellite sensors into one merged, calibrated
 * precipitation-rate field, published in real 30-minute steps (with real
 * gaps where a period hasn't been processed yet - typically running ~4-6
 * hours behind "now", which is genuine NRT latency, not a bug).
 *
 * All tiling metadata below was read from the real GIBS WMTS
 * GetCapabilities document, then verified against live tile requests
 * (GoogleMapsCompatible_Level6 confirmed as the real max zoom for this
 * layer specifically).
 */

export const IMERG_LAYER = "IMERG_Precipitation_Rate_30min";
export const IMERG_TILE_MATRIX_SET = "GoogleMapsCompatible_Level6";
export const IMERG_TILE_SIZE = 256;
export const IMERG_NATIVE_MAX_ZOOM = 6;
export const IMERG_FORMAT = "png";
export const IMERG_NOMINAL_RESOLUTION_KM = 10;
export const IMERG_PRODUCT_NAME = "GPM IMERG Precipitation Rate (NRT)";
export const IMERG_ATTRIBUTION = "Imagery: NASA EOSDIS GIBS / GPM IMERG";
export const IMERG_CADENCE_MINUTES = 30;

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** `time` is either "default" (best-available/latest) or an ISO minute-precision timestamp. */
export function imergTileUrlTemplate(time: string): string {
  return `${GIBS_BASE}/${IMERG_LAYER}/default/${time}/${IMERG_TILE_MATRIX_SET}/{z}/{y}/{x}.${IMERG_FORMAT}`;
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
  const url = imergTileUrlTemplate(time)
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
 * Probes real, existing 30-minute timestamps going back from now (newest
 * first, starting a few hours back to account for typical NRT latency),
 * verifying every candidate against a live tile request in parallel and
 * keeping only the ones that actually exist. Returns up to `count` real
 * frames - never a fabricated/interpolated timestamp.
 */
export async function recentImergFrames(
  count = 10,
  candidateSteps = 24,
  startHoursAgo = 3
): Promise<string[]> {
  const start = floorToStep(new Date(Date.now() - startHoursAgo * 3_600_000), IMERG_CADENCE_MINUTES);
  const candidates = Array.from({ length: candidateSteps }, (_, i) =>
    toIsoMinute(new Date(start.getTime() - i * IMERG_CADENCE_MINUTES * 60_000))
  );
  const checks = await Promise.all(candidates.map((t) => tileExists(t).then((ok) => (ok ? t : null))));
  return checks.filter((t): t is string => t !== null).slice(0, count);
}
