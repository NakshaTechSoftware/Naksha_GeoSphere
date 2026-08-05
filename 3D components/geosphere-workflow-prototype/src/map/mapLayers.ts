import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

/** Stable IDs so sources/layers are only ever added once per map instance. */
export const SOURCE_IDS = {
  aoi: "geosphere-aoi-source",
  aoiVertices: "geosphere-aoi-vertices-source",
  locationMarker: "geosphere-location-marker-source",
} as const;

export const LAYER_IDS = {
  aoiFill: "geosphere-aoi-fill",
  aoiOutline: "geosphere-aoi-outline",
  aoiVertices: "geosphere-aoi-vertices",
  locationMarker: "geosphere-location-marker",
  buildings3d: "geosphere-3d-buildings",
} as const;

const EMPTY_POLYGON_COLLECTION: FeatureCollection<Polygon> = { type: "FeatureCollection", features: [] };
const EMPTY_POINT_COLLECTION: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

/**
 * Idempotent — safe to call every time the map style loads (including
 * across style reloads triggered by fallback recovery). Never adds a
 * duplicate source or layer.
 */
export function ensureWorkflowLayers(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_IDS.aoi)) {
    map.addSource(SOURCE_IDS.aoi, { type: "geojson", data: EMPTY_POLYGON_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.aoiVertices)) {
    map.addSource(SOURCE_IDS.aoiVertices, { type: "geojson", data: EMPTY_POINT_COLLECTION });
  }
  if (!map.getSource(SOURCE_IDS.locationMarker)) {
    map.addSource(SOURCE_IDS.locationMarker, { type: "geojson", data: EMPTY_POINT_COLLECTION });
  }

  if (!map.getLayer(LAYER_IDS.aoiFill)) {
    map.addLayer({
      id: LAYER_IDS.aoiFill,
      type: "fill",
      source: SOURCE_IDS.aoi,
      paint: {
        "fill-color": "#3563e9",
        "fill-opacity": 0.24,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.aoiOutline)) {
    map.addLayer({
      id: LAYER_IDS.aoiOutline,
      type: "line",
      source: SOURCE_IDS.aoi,
      paint: {
        "line-color": "#3563e9",
        "line-width": 2.5,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.aoiVertices)) {
    map.addLayer({
      id: LAYER_IDS.aoiVertices,
      type: "circle",
      source: SOURCE_IDS.aoiVertices,
      paint: {
        "circle-radius": 5,
        "circle-color": "#ffffff",
        "circle-stroke-color": "#3563e9",
        "circle-stroke-width": 2,
      },
    });
  }

  if (!map.getLayer(LAYER_IDS.locationMarker)) {
    map.addLayer({
      id: LAYER_IDS.locationMarker,
      type: "circle",
      source: SOURCE_IDS.locationMarker,
      paint: {
        "circle-radius": 7,
        "circle-color": "#3563e9",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
  }

  ensureBuildingExtrusion(map);
}

/** Adds restrained 3D building extrusion when the active style exposes a buildings source. Silently no-ops otherwise. */
function ensureBuildingExtrusion(map: MapLibreMap): void {
  if (map.getLayer(LAYER_IDS.buildings3d)) return;

  const style = map.getStyle();
  const buildingSourceLayer = style?.layers?.find(
    (layer) => "source-layer" in layer && layer["source-layer"] === "building",
  );
  if (!buildingSourceLayer || !("source" in buildingSourceLayer)) return;

  try {
    map.addLayer({
      id: LAYER_IDS.buildings3d,
      type: "fill-extrusion",
      source: buildingSourceLayer.source,
      "source-layer": "building",
      paint: {
        "fill-extrusion-color": "#dce6f9",
        "fill-extrusion-height": ["coalesce", ["get", "height"], 12],
        "fill-extrusion-opacity": 0.45,
      },
    });
  } catch {
    // Style does not support extrusion on this source — continue without it.
  }
}

export function setAoiPolygon(map: MapLibreMap, feature: Feature<Polygon> | null): void {
  const source = map.getSource(SOURCE_IDS.aoi) as GeoJSONSource | undefined;
  source?.setData(feature ? { type: "FeatureCollection", features: [feature] } : EMPTY_POLYGON_COLLECTION);
}

export function setAoiVertices(map: MapLibreMap, points: [number, number][]): void {
  const source = map.getSource(SOURCE_IDS.aoiVertices) as GeoJSONSource | undefined;
  const collection: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: points.map((coordinates) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: {},
    })),
  };
  source?.setData(collection);
}

export function setLocationMarker(map: MapLibreMap, coordinates: [number, number] | null): void {
  const source = map.getSource(SOURCE_IDS.locationMarker) as GeoJSONSource | undefined;
  source?.setData(
    coordinates
      ? {
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties: {} }],
        }
      : EMPTY_POINT_COLLECTION,
  );
}
