import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { DEMO_AOI_COORDINATES } from "@/data/mockWorkflow";

/** Builds the demo AOI polygon feature from the fixed coordinate list. */
export function buildDemoAoiPolygon(): Feature<Polygon> {
  return turf.polygon([DEMO_AOI_COORDINATES]);
}

/** Returns the AOI vertices excluding the closing duplicate of the first point. */
export function getAoiVertices(): [number, number][] {
  return DEMO_AOI_COORDINATES.slice(0, -1);
}

/** Vertices revealed progressively for the "draw" animation, up to `count`. */
export function getAoiVerticesUpTo(count: number): [number, number][] {
  return getAoiVertices().slice(0, count);
}

export function calculateAoiAreaSqKm(feature: Feature<Polygon>): number {
  const areaSqM = turf.area(feature);
  return areaSqM / 1_000_000;
}

export function calculateAoiCentroid(feature: Feature<Polygon>): [number, number] {
  const centroid = turf.centroid(feature);
  return centroid.geometry.coordinates as [number, number];
}

export function calculateAoiBounds(feature: Feature<Polygon>): [number, number, number, number] {
  return turf.bbox(feature) as [number, number, number, number];
}
