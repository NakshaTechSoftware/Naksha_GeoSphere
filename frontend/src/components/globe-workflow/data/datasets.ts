// The geospatial catalogue presented during DATA_DISCOVERY / FORMAT_SELECTION.

export interface DatasetDef {
  id: string;
  name: string;
  kind: "imagery" | "elevation" | "kml" | "contours" | "3d";
  /** INR price shown in the demo (deterministic per dataset set). */
  priceInr: number;
  preview: string;
  description: string;
}

export const CATALOGUE: DatasetDef[] = [
  {
    id: "imagery",
    name: "Premium Imagery",
    kind: "imagery",
    priceInr: 999,
    preview: "/assets/orthophoto-preview.svg",
    description: "High-resolution orthophoto",
  },
  {
    id: "elevation",
    name: "Elevation",
    kind: "elevation",
    priceInr: 699,
    preview: "/assets/elevation-preview.svg",
    description: "DEM / DSM elevation",
  },
  {
    id: "kml",
    name: "KML / KMZ",
    kind: "kml",
    priceInr: 250,
    preview: "/assets/kml-preview.svg",
    description: "Boundary vector package",
  },
  {
    id: "contours",
    name: "Contours",
    kind: "contours",
    priceInr: 549,
    preview: "/assets/elevation-preview.svg",
    description: "Vector contour lines",
  },
  {
    id: "3d",
    name: "3D View",
    kind: "3d",
    priceInr: 1499,
    preview: "/assets/orthophoto-preview.svg",
    description: "Photoreal 3D mesh",
  },
];

/** The two datasets the demo selects for the main storyline. */
export const DEMO_SELECTION_IDS = ["imagery", "kml"] as const;

export function getDataset(id: string): DatasetDef {
  const d = CATALOGUE.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown dataset id: ${id}`);
  return d;
}

export function totalPriceFor(ids: string[]): number {
  return ids.reduce((sum, id) => sum + getDataset(id).priceInr, 0);
}
