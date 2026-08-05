export type DatasetCategory = "imagery" | "elevation" | "contours" | "3d";

export type DatasetProduct = {
  id: string;
  name: string;
  category: DatasetCategory;
  format: string;
  resolution: string;
  pricePerSquareKm: number;
  previewImage: string;
};

/**
 * Deterministic, typed product catalogue for the demo. Prices are
 * INR-per-km^2 so the workflow total scales with the drawn AOI area
 * (see aoiGeometry.ts / mockWorkflow.ts) instead of being hard-coded.
 */
export const DATASET_PRODUCTS: DatasetProduct[] = [
  {
    id: "imagery",
    name: "Premium Orthophoto",
    category: "imagery",
    format: "GeoTIFF",
    resolution: "30 cm",
    pricePerSquareKm: 950,
    previewImage: "/assets/dataset-imagery-preview.webp",
  },
  {
    id: "elevation",
    name: "Digital Elevation Model",
    category: "elevation",
    format: "DEM",
    resolution: "1 m",
    pricePerSquareKm: 430,
    previewImage: "/assets/dataset-elevation-preview.webp",
  },
  {
    id: "contours",
    name: "Contour Lines",
    category: "contours",
    format: "GeoJSON",
    resolution: "1 m interval",
    pricePerSquareKm: 210,
    previewImage: "/assets/dataset-imagery-preview.webp",
  },
  {
    id: "3d",
    name: "3D Building Models",
    category: "3d",
    format: "3D Tiles",
    resolution: "LOD2",
    pricePerSquareKm: 610,
    previewImage: "/assets/dataset-elevation-preview.webp",
  },
];

export const DEFAULT_SELECTED_DATASET_IDS: string[] = ["imagery", "elevation"];

export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function calculateTotalPrice(datasetIds: string[], areaSqKm: number): number {
  return DATASET_PRODUCTS.filter((product) => datasetIds.includes(product.id)).reduce(
    (total, product) => total + product.pricePerSquareKm * areaSqKm,
    0,
  );
}
