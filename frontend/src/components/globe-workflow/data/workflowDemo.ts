// Deterministic demo data for the visual workflow. Nothing here touches real systems.

/** Masked demo email - never a real stored address. */
export const DEMO_EMAIL = "arj•••@company.com";

/** Export package name built from the current city. */
export function exportPackageName(city: string): string {
  const slug = city.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${slug}_AOI`;
}

/** Formats a geodesic area in km² for the demo UI. */
export function formatAreaKm2(areaSqKm: number): string {
  if (areaSqKm < 10) return areaSqKm.toFixed(2);
  if (areaSqKm < 100) return areaSqKm.toFixed(1);
  return Math.round(areaSqKm).toString();
}

export const SECURE_DELIVERY_EXPIRY = "24 Hours";

/** Layers shown in the Layers panel. */
export const LAYER_OPTIONS = [
  { id: "imagery", label: "Imagery", selected: true },
  { id: "elevation", label: "Elevation", selected: false },
  { id: "buildings", label: "Buildings", selected: false },
  { id: "roads", label: "Roads", selected: false },
  { id: "hydrography", label: "Hydrography", selected: false },
  { id: "landuse", label: "Land Use", selected: false },
  { id: "contours", label: "Contours", selected: false },
] as const;

/** Payment method options (symbolic only). */
export const PAYMENT_METHODS = ["UPI", "Card", "Net Banking"] as const;

/** Processing progress milestones (percent). */
export const PROCESSING_STEPS = [
  { pct: 0, label: "Payment verified" },
  { pct: 22, label: "Processing selected AOI" },
  { pct: 45, label: "Preparing geospatial layers" },
  { pct: 68, label: "Generating KML/KMZ" },
  { pct: 84, label: "Preparing imagery package" },
  { pct: 92, label: "Encrypting secure download" },
  { pct: 100, label: "Preparing delivery" },
] as const;
