export type SatelliteProduct = "ir1" | "visible" | "water_vapour" | "ctt";

export interface SatelliteProductConfig {
  id: SatelliteProduct;
  label: string;
  shortLabel: string;
  description: string;
  gifUrl: string;
  staticUrl: string;
  /** Best-effort geographic bounds [west, south, east, north] in degrees.
   *  Calibrated from IMD's printed lat/lon gridlines on the actual imagery.
   *  IR1/VIS/WV share the same template; CTT uses a slightly different projection. */
  bounds: [number, number, number, number];
  /** Pixel dimensions of a single frame [width, height]. */
  frameSize: [number, number];
  /** Number of frames in the animated GIF. */
  frameCount: number;
  /** Per-frame delay in milliseconds (from GIF metadata). */
  frameDelayMs: number;
}

export const SATELLITE_PRODUCTS: Record<SatelliteProduct, SatelliteProductConfig> = {
  ir1: {
    id: "ir1",
    label: "IR1",
    shortLabel: "IR1",
    description: "Infrared cloud imagery; available day and night.",
    gifUrl: "https://mausam.imd.gov.in/Satellite/Converted/IR1.gif",
    staticUrl: "https://mausam.imd.gov.in/Satellite/3Dasiasec_ir1.jpg",
    bounds: [40, -5, 110, 45],
    frameSize: [1260, 1319],
    frameCount: 12,
    frameDelayMs: 400,
  },
  visible: {
    id: "visible",
    label: "Visible",
    shortLabel: "VIS",
    description: "Daylight visible-spectrum cloud imagery.",
    gifUrl: "https://mausam.imd.gov.in/Satellite/Converted/VIS.gif",
    staticUrl: "https://mausam.imd.gov.in/Satellite/3Dasiasec_vis.jpg",
    bounds: [40, -5, 110, 45],
    frameSize: [1260, 1319],
    frameCount: 12,
    frameDelayMs: 400,
  },
  water_vapour: {
    id: "water_vapour",
    label: "Water Vapour",
    shortLabel: "WV",
    description: "Atmospheric water-vapour imagery.",
    gifUrl: "https://mausam.imd.gov.in/Satellite/Converted/WV.gif",
    staticUrl: "https://mausam.imd.gov.in/Satellite/3Dasiasec_wv.jpg",
    bounds: [40, -5, 110, 45],
    frameSize: [1260, 1319],
    frameCount: 12,
    frameDelayMs: 400,
  },
  ctt: {
    id: "ctt",
    label: "Cloud Top Brightness Temp",
    shortLabel: "CTBT",
    description: "Cloud-top temperature visualization.",
    gifUrl: "https://mausam.imd.gov.in/Satellite/Converted/CTBT.gif",
    staticUrl: "https://mausam.imd.gov.in/Satellite/3Dasiasec_ctbt.jpg",
    bounds: [40, -5, 110, 45],
    frameSize: [1260, 1313],
    frameCount: 12,
    frameDelayMs: 400,
  },
};

export interface SatelliteFrame {
  index: number;
  width: number;
  height: number;
}

export interface SatelliteManifest {
  product: SatelliteProduct;
  frames: SatelliteFrame[];
  lastModified: string;
  totalSize: number;
}
