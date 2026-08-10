import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

export const SOURCE_IDS = {
  ocean: "ocean",
  graticule: "graticule",
  indiaBoundary: "india-boundary",
  indiaStates: "india-states",
  karnataka: "karnataka",
  localGridMinor: "grid-minor",
  localGridMajor: "grid-major",
  aoi: "aoi",
  aoiFill: "aoi-fill",
} as const;

/** Adds the globe-primitive sources (ocean sphere + graticule). Called once per map. */
export function addGlobeSources(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_IDS.ocean)) {
    map.addSource(SOURCE_IDS.ocean, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] },
          },
        ],
      },
    });
  }
  if (!map.getSource(SOURCE_IDS.graticule)) {
    map.addSource(SOURCE_IDS.graticule, {
      type: "geojson",
      data: buildGraticule(10, 10),
    });
  }
}

/** Adds local-map grid sources. Called when entering Mercator fallback view. */
export function addLocalGridSources(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_IDS.localGridMinor)) {
    map.addSource(SOURCE_IDS.localGridMinor, { type: "geojson", data: buildGraticule(2, 2) });
  }
  if (!map.getSource(SOURCE_IDS.localGridMajor)) {
    map.addSource(SOURCE_IDS.localGridMajor, { type: "geojson", data: buildGraticule(10, 10) });
  }
}

export function setSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection): void {
  const src = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (src && typeof src.setData === "function") src.setData(data);
}

/** Builds a graticule (lat/lng grid) FeatureCollection. */
function buildGraticule(stepLng: number, stepLat: number): FeatureCollection {
  const lines: GeoJSON.LineString[] = [];
  for (let lng = -180; lng <= 180; lng += stepLng) {
    const coords: [number, number][] = [];
    for (let lat = -90; lat <= 90; lat += 2) coords.push([lng, lat]);
    lines.push({ type: "LineString", coordinates: coords });
  }
  for (let lat = -80; lat <= 80; lat += stepLat) {
    const coords: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 2) coords.push([lng, lat]);
    lines.push({ type: "LineString", coordinates: coords });
  }
  return {
    type: "FeatureCollection",
    features: lines.map((geometry) => ({ type: "Feature", properties: {}, geometry })),
  };
}
