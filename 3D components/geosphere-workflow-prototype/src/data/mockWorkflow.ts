/**
 * Deterministic demo content — a real user would search freely, but the
 * cinematic loop always tells the same Bengaluru story so timing, AOI
 * geometry and pricing stay reproducible across every loop and in tests.
 */
export const DEMO_SEARCH_QUERY = "Bengaluru, Karnataka";

export const DEMO_ORDER_REFERENCE = "NGS-DEMO-2048";

export const DEMO_PACKAGE_FILENAME = "Bengaluru_AOI_Package.zip";

export const DEMO_PACKAGE_FORMATS = "GeoTIFF + DEM";

export const DEMO_PACKAGE_SIZE = "842 MB";

export const SECURE_PROCESSING_STAGES = [
  "Validating selected area",
  "Preparing imagery",
  "Packaging elevation data",
  "Securing your order",
  "Purchase confirmed",
] as const;

/** Bengaluru urban AOI: 7 vertices, deliberately irregular (not a rectangle). */
export const DEMO_AOI_COORDINATES: [number, number][] = [
  [77.5946, 12.9784],
  [77.6068, 12.9819],
  [77.6142, 12.9761],
  [77.611, 12.9676],
  [77.6021, 12.9629],
  [77.5931, 12.9663],
  [77.589, 12.9737],
  [77.5946, 12.9784],
];

export const DEMO_RESOLUTION_LABEL = "30 cm / 1 m";

export const BENGALURU_WIDE_VIEW = {
  center: [77.35, 13.9] as [number, number],
  zoom: 6.4,
  pitch: 0,
  bearing: 0,
};

export const BENGALURU_CLOSE_VIEW = {
  center: [77.6008, 12.9735] as [number, number],
  zoom: 14.4,
  pitch: 48,
  bearing: 8,
};

export const BENGALURU_RESET_VIEW = {
  center: [77.62, 12.99] as [number, number],
  zoom: 12.6,
  pitch: 20,
  bearing: 0,
};
