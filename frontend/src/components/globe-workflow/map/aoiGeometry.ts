import { area, bbox, centroid, polygon } from "@turf/turf";
import type { Feature, Polygon } from "geojson";

export interface AOIGeometry {
  feature: Feature<Polygon>;
  areaSqKm: number;
  centroid: [number, number];
  bounds: [number, number, number, number]; // [w, s, e, n]
  vertices: [number, number][];
}

/**
 * Generates a deterministic IRREGULAR AOI polygon around a city center. Not a square, not a
 * regular hexagon: 6-8 points with seeded-ish offsets (deterministic per city, so loops are
 * stable but each city gets a slightly different hand-drawn feel). Uses real local offsets
 * (~1.2-2.2 km) so the resulting area is a moderate urban selection.
 */
export function buildAOIPolygon(
  center: [number, number],
  seed: number
): AOIGeometry {
  const [lng, lat] = center;
  const rng = mulberry32(seed);

  // Local meters -> degrees.
  const kmPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  const kmPerDegLat = 110.574;

  const pointCount = 7; // irregular 7-gon
  const radii = Array.from({ length: pointCount }, () => 1.1 + rng() * 1.3); // 1.1-2.4 km
  const angles: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    // Non-uniform spacing produces the irregular (hand-drawn) feel.
    angles.push((i / pointCount) * Math.PI * 2 + (rng() - 0.5) * 0.55);
  }
  angles.sort((a, b) => a - b);

  const coords: [number, number][] = angles.map((ang, i) => {
    const rKm = radii[i]!;
    const dLng = (rKm * Math.cos(ang)) / kmPerDegLng;
    const dLat = (rKm * Math.sin(ang)) / kmPerDegLat;
    return [lng + dLng, lat + dLat];
  });
  coords.push([...(coords[0] ?? [lng, lat])]);

  const feat = polygon([coords]);

  const a = area(feat) / 1e6; // km²
  const c = centroid(feat).geometry.coordinates as [number, number];
  const b = bbox(feat) as [number, number, number, number];

  return { feature: feat, areaSqKm: a, centroid: c, bounds: b, vertices: coords.slice(0, -1) };
}

/** Deterministic PRNG so the polygon is stable across loops for the same city. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable per-city seed (from the city name). */
export function seedForCity(city: string): number {
  let h = 2166136261;
  for (let i = 0; i < city.length; i++) {
    h ^= city.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
