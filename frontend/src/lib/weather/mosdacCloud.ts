/**
 * MOSDAC/INSAT Geostationary Satellite Cloud Imagery.
 *
 * This module provides access to ISRO MOSDAC INSAT-3D/3DR/3DS geostationary
 * satellite cloud imagery. INSAT-3DS is the latest operational satellite
 * (launched 2024) with improved imager and sounder.
 *
 * MOSDAC (Meteorological & Oceanographic Satellite Data Archival Centre)
 * is ISRO's official data portal for INSAT, Scatsat, Oceansat, Megha-Tropiques,
 * and other ISRO meteorological/oceanographic missions.
 *
 * KEY PRODUCTS (from MOSDAC catalog):
 * - INSAT-3D/3DR Imager: Visible (VIS), Shortwave IR (SWIR), Midwave IR (MIR),
 *   Water Vapor (WV), Thermal IR (TIR1, TIR2) - 1km/4km resolution, 15-30 min
 * - INSAT-3DS Imager: Similar channels with improved resolution/sensitivity
 * - INSAT-3D/3DR Sounder: 18-channel sounder for temperature/humidity profiles
 *
 * ACCESS:
 * - MOSDAC requires registration and authentication for bulk/data access
 * - Some products available via WMS/WMTS/WCS endpoints
 * - For this implementation, we use the MOSDAC WMS endpoint which provides
 *   tiled imagery for web mapping applications.
 *
 * PROJECTION: INSAT geostationary data is typically served in geographic
 * (lat/lon) or geostationary projection. MOSDAC WMS supports EPSG:4326.
 *
 * REFERENCE: MOSDAC WMS GetCapabilities:
 * https://mosdac.gov.in/geoserver/ows?service=WMS&request=GetCapabilities
 */

export interface MosdacProduct {
  id: string;
  name: string;
  layer: string;
  description: string;
  channels: string[];
  resolution: string;
  temporalResolution: string;
  dayNight: "day" | "night" | "both";
}

// INSAT-3D/3DR/3DS Imager products available via MOSDAC WMS
export const MOSDAC_INSAT_PRODUCTS: MosdacProduct[] = [
  {
    id: "insat3d_vis",
    name: "INSAT-3D/3DR Visible",
    layer: "insat3d:vis",
    description: "Visible channel (0.55-0.75 µm) - daytime cloud structure",
    channels: ["VIS"],
    resolution: "1 km",
    temporalResolution: "15-30 min",
    dayNight: "day",
  },
  {
    id: "insat3d_swir",
    name: "INSAT-3D/3DR Shortwave IR",
    layer: "insat3d:swir",
    description: "Shortwave IR (1.55-1.75 µm) - cloud phase, snow/ice",
    channels: ["SWIR"],
    resolution: "1 km",
    temporalResolution: "15-30 min",
    dayNight: "day",
  },
  {
    id: "insat3d_mir",
    name: "INSAT-3D/3DR Midwave IR",
    layer: "insat3d:mir",
    description: "Midwave IR (3.8-4.0 µm) - fire/hotspot, night clouds",
    channels: ["MIR"],
    resolution: "4 km",
    temporalResolution: "15-30 min",
    dayNight: "both",
  },
  {
    id: "insat3d_wv",
    name: "INSAT-3D/3DR Water Vapor",
    layer: "insat3d:wv",
    description: "Water Vapor (6.5-7.1 µm) - upper tropospheric moisture",
    channels: ["WV"],
    resolution: "4 km",
    temporalResolution: "15-30 min",
    dayNight: "both",
  },
  {
    id: "insat3d_tir1",
    name: "INSAT-3D/3DR Thermal IR 1",
    layer: "insat3d:tir1",
    description: "Thermal IR 1 (10.3-11.3 µm) - cloud top temperature, SST",
    channels: ["TIR1"],
    resolution: "4 km",
    temporalResolution: "15-30 min",
    dayNight: "both",
  },
  {
    id: "insat3d_tir2",
    name: "INSAT-3D/3DR Thermal IR 2",
    layer: "insat3d:tir2",
    description: "Thermal IR 2 (11.5-12.5 µm) - cloud typing, dust",
    channels: ["TIR2"],
    resolution: "4 km",
    temporalResolution: "15-30 min",
    dayNight: "both",
  },
  // INSAT-3DS products (latest, improved)
  {
    id: "insat3ds_vis",
    name: "INSAT-3DS Visible",
    layer: "insat3ds:vis",
    description: "Visible channel - improved daytime cloud structure",
    channels: ["VIS"],
    resolution: "1 km",
    temporalResolution: "15 min",
    dayNight: "day",
  },
  {
    id: "insat3ds_tir1",
    name: "INSAT-3DS Thermal IR 1",
    layer: "insat3ds:tir1",
    description: "Thermal IR 1 - improved cloud top temperature",
    channels: ["TIR1"],
    resolution: "4 km",
    temporalResolution: "15 min",
    dayNight: "both",
  },
  {
    id: "insat3ds_wv",
    name: "INSAT-3DS Water Vapor",
    layer: "insat3ds:wv",
    description: "Water Vapor - improved moisture tracking",
    channels: ["WV"],
    resolution: "4 km",
    temporalResolution: "15 min",
    dayNight: "both",
  },
];

// Default cloud visualization products
export const CLOUD_DAY_PRODUCT = MOSDAC_INSAT_PRODUCTS.find((p) => p.id === "insat3ds_vis") ?? MOSDAC_INSAT_PRODUCTS[0];
export const CLOUD_NIGHT_PRODUCT = MOSDAC_INSAT_PRODUCTS.find((p) => p.id === "insat3ds_tir1") ?? MOSDAC_INSAT_PRODUCTS[4];

export const MOSDAC_WMS_BASE = "https://mosdac.gov.in/geoserver/ows";
export const MOSDAC_WMS_VERSION = "1.3.0";
export const MOSDAC_TILE_SIZE = 256;

// TileMatrixSet for INSAT geostationary data in Web Mercator
export const MOSDAC_TILE_MATRIX_SET = "EPSG:3857";

/**
 * Build a WMS tile URL for MOSDAC INSAT imagery.
 * Note: MOSDAC WMS may require authentication for production use.
 * For development, some layers may be accessible without auth.
 */
export function mosdacTileUrlTemplate(
  layer: string,
  time: string, // ISO timestamp
  options: {
    tileMatrixSet?: string;
    format?: string;
    styles?: string;
    authToken?: string;
  } = {}
): string {
  const {
    tileMatrixSet = MOSDAC_TILE_MATRIX_SET,
    format = "image/png",
    styles = "",
    authToken,
  } = options;

  const params = new URLSearchParams({
    service: "WMS",
    request: "GetTile",
    version: MOSDAC_WMS_VERSION,
    layer,
    style: styles,
    tileMatrixSet,
    tileMatrix: "{z}",
    tileRow: "{y}",
    tileCol: "{x}",
    format,
    time, // TIME parameter for temporal dimension
  });

  if (authToken) {
    params.set("auth_token", authToken);
  }

  return `${MOSDAC_WMS_BASE}?${params.toString()}`;
}

/**
 * Probe whether a specific MOSDAC layer/time combination has valid tiles.
 */
export async function probeMosdacTile(
  layer: string,
  time: string,
  options: { authToken?: string; signal?: AbortSignal } = {}
): Promise<boolean> {
  // Probe at zoom 5 over India (approximate tile coordinates)
  const probeZ = 5;
  const probeX = 22;
  const probeY = 13;

  const url = mosdacTileUrlTemplate(layer, time)
    .replace("{z}", String(probeZ))
    .replace("{x}", String(probeX))
    .replace("{y}", String(probeY));

  try {
    const headers: Record<string, string> = {};
    if (options.authToken) {
      headers["Authorization"] = `Bearer ${options.authToken}`;
    }
    const res = await fetch(url, { method: "HEAD", signal: options.signal, headers });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ResolvedMosdacCloud {
  product: MosdacProduct;
  time: string; // ISO timestamp of the frame
  layer: string;
  satelliteLabel: string;
}

/**
 * Resolve the latest available INSAT cloud frame for the given day/night mode.
 * Tries INSAT-3DS first (latest), then INSAT-3D/3DR.
 */
export async function resolveMosdacCloud(
  dayNight: "day" | "night",
  options: { authToken?: string; signal?: AbortSignal } = {}
): Promise<ResolvedMosdacCloud | null> {
  const now = new Date();
  // INSAT data typically has 15-30 min latency
  // Try current time rounded to nearest 15 min, then go back
  const candidateTimes: string[] = [];
  for (let i = 0; i < 12; i++) { // Look back up to 3 hours
    const t = new Date(now.getTime() - i * 15 * 60 * 1000);
    // Round to nearest 15 minutes
    t.setMinutes(Math.floor(t.getMinutes() / 15) * 15, 0, 0);
    candidateTimes.push(t.toISOString());
  }

  const products = MOSDAC_INSAT_PRODUCTS.filter(
    (p) => p.dayNight === dayNight || p.dayNight === "both"
  );

  // Priority: INSAT-3DS > INSAT-3D/3DR
  const sortedProducts = products.sort((a, b) => {
    const aIs3ds = a.id.startsWith("insat3ds");
    const bIs3ds = b.id.startsWith("insat3ds");
    if (aIs3ds && !bIs3ds) return -1;
    if (!aIs3ds && bIs3ds) return 1;
    return 0;
  });

  for (const product of sortedProducts) {
    for (const time of candidateTimes) {
      if (await probeMosdacTile(product.layer, time, options)) {
        return {
          product,
          time,
          layer: product.layer,
          satelliteLabel: product.name,
        };
      }
    }
  }

  return null;
}

/** Generate recent timestamps for animation controls (newest first). */
export function recentMosdacTimes(count = 12): string[] {
  const now = new Date();
  const times: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(now.getTime() - i * 15 * 60 * 1000);
    t.setMinutes(Math.floor(t.getMinutes() / 15) * 15, 0, 0);
    times.push(t.toISOString());
  }
  return times;
}