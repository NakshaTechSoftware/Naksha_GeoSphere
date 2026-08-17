/**
 * Multi-geostationary-satellite cloud composite.
 *
 * GIBS serves three geostationary "Clean Infrared Band 13" layers:
 *   - Himawari-9 AHI  → Asia-Pacific  (~50°E – ~180°E)
 *   - GOES-West ABI   → Americas/Pacific (~180°W – ~100°W)
 *   - GOES-East ABI   → Americas/Atlantic (~100°W – ~10°W)
 *
 * None alone gives global coverage.  By stacking all three as separate
 * MapLibre raster layers on top of each other, the user sees cloud
 * imagery across the entire globe – each satellite's disk fills in the
 * gaps left by the others.
 *
 * All three products share the same Band 13 thermal-IR physics (10.3 µm
 * clean window), so the visual appearance is consistent and the layers
 * blend naturally at their edges.
 *
 * IMPORTANT: GIBS returns 404 for tiles outside a geostationary
 * satellite's disk, so each satellite MUST be probed at a point within
 * its own coverage area.  Using the same probe coordinates for all
 * three will cause GOES-West/GOES-East to falsely report as unavailable.
 */

export interface GeoSatelliteDef {
  id: string;
  layer: string;
  label: string;
  attribution: string;
  tileMatrixSet: string;
  maxZoom: number;
  tileSize: number;
  cadenceMinutes: number;
  /** z/x/y tile coordinates that lie within this satellite's disk, used
   *  to probe whether a given timestamp actually has data. */
  probe: { z: number; x: number; y: number };
}

/** The three GIBS geostationary cloud IR layers. */
export const GEO_SATELLITES: GeoSatelliteDef[] = [
  {
    id: "himawari",
    layer: "Himawari_AHI_Band13_Clean_Infrared",
    label: "Himawari-9 (Asia-Pacific)",
    attribution: "Imagery: NASA EOSDIS GIBS / JMA Himawari-9 AHI",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxZoom: 6,
    tileSize: 256,
    cadenceMinutes: 10,
    // z=4, x=11 → ~67-90°E (India, well within Himawari disk)
    probe: { z: 4, x: 11, y: 6 },
  },
  {
    id: "goes-west",
    layer: "GOES-West_ABI_Band13_Clean_Infrared",
    label: "GOES-West (Americas/Pacific)",
    attribution: "Imagery: NASA EOSDIS GIBS / NOAA GOES-West ABI",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxZoom: 6,
    tileSize: 256,
    cadenceMinutes: 10,
    // z=4, x=2 → ~157-135°W (Central America, well within GOES-West disk)
    probe: { z: 4, x: 2, y: 6 },
  },
  {
    id: "goes-east",
    layer: "GOES-East_ABI_Band13_Clean_Infrared",
    label: "GOES-East (Americas/Atlantic)",
    attribution: "Imagery: NASA EOSDIS GIBS / NOAA GOES-East ABI",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxZoom: 6,
    tileSize: 256,
    cadenceMinutes: 10,
    // z=4, x=4 → ~112-90°W (Caribbean/Eastern Americas, within GOES-East disk)
    probe: { z: 4, x: 4, y: 6 },
  },
];

export const GEO_HIMAWARI = GEO_SATELLITES[0]!;
export const GEO_GOES_WEST = GEO_SATELLITES[1]!;
export const GEO_GOES_EAST = GEO_SATELLITES[2]!;

const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export function geoCloudTileUrlTemplate(sat: GeoSatelliteDef, time: string): string {
  return `${GIBS_BASE}/${sat.layer}/default/${time}/${sat.tileMatrixSet}/{z}/{y}/{x}.png`;
}

// ── Shared frame probing ──────────────────────────────────────────────────────

function floorToStep(date: Date, stepMinutes: number): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / stepMinutes) * stepMinutes);
  return d;
}

function toIsoMinute(date: Date): string {
  return date.toISOString().slice(0, 16) + ":00Z";
}

async function tileExists(sat: GeoSatelliteDef, time: string, signal?: AbortSignal): Promise<boolean> {
  const url = geoCloudTileUrlTemplate(sat, time)
    .replace("{z}", String(sat.probe.z))
    .replace("{x}", String(sat.probe.x))
    .replace("{y}", String(sat.probe.y));
  try {
    const res = await fetch(url, { method: "GET", signal });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves real recent frames for a given satellite.
 * Probes timestamps going backwards from now, keeping only real ones.
 */
export async function recentGeoFrames(
  sat: GeoSatelliteDef,
  count = 12,
  candidateSteps = 30
): Promise<string[]> {
  const start = floorToStep(new Date(), sat.cadenceMinutes);
  const candidates = Array.from({ length: candidateSteps }, (_, i) =>
    toIsoMinute(new Date(start.getTime() - i * sat.cadenceMinutes * 60_000))
  );
  const checks = await Promise.all(
    candidates.map((t) => tileExists(sat, t).then((ok) => (ok ? t : null)))
  );
  return checks.filter((t): t is string => t !== null).slice(0, count);
}

/**
 * Finds a common time that works for ALL three satellites.
 * Returns the most recent shared timestamp, or null if none exists.
 */
export async function findCommonFrame(
  candidateSteps = 30
): Promise<string | null> {
  const start = floorToStep(new Date(), GEO_HIMAWARI.cadenceMinutes);
  const candidates = Array.from({ length: candidateSteps }, (_, i) =>
    toIsoMinute(new Date(start.getTime() - i * GEO_HIMAWARI.cadenceMinutes * 60_000))
  );

  for (const t of candidates) {
    const results = await Promise.all(
      GEO_SATELLITES.map((sat) => tileExists(sat, t))
    );
    if (results.every(Boolean)) return t;
  }
  return null;
}
