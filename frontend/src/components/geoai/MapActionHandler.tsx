/**
 * MapActionHandler — Executes map visualization actions returned by the
 * GeoAI Agent. Receives a map_action payload and applies it to the
 * MapLibre GL map instance.
 *
 * Supports: marker, route, polygon, highlight, fly_to, multi_marker, add_layer
 */

"use client";

import { useCallback, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

export interface MapAction {
  type: string;
  [key: string]: unknown;
}

interface MarkerData {
  coordinates: [number, number];
  label?: string;
  popup?: string;
}

// Track added layer/source IDs for cleanup
const addedLayerIds = new Set<string>();

export function useMapActionHandler(map: MapLibreMap | null) {
  const popupRef = useRef<unknown>(null);

  /**
   * Execute a map action from the AI agent response.
   */
  const executeMapAction = useCallback(
    (action: MapAction | null | undefined) => {
      if (!action || !map) return;

      switch (action.type) {
        case "marker":
          handleMarker(map, action as unknown as MarkerData);
          break;
        case "multi_marker":
          handleMultiMarker(map, action as unknown as { markers: MarkerData[] });
          break;
        case "route":
          handleRoute(map, action as unknown as {
            coordinates: [number, number][];
            distance_meters?: number;
            duration_seconds?: number;
          });
          break;
        case "polygon":
        case "highlight":
          handlePolygon(map, action as unknown as {
            geometry: GeoJSON.Geometry;
            label?: string;
            color?: string;
            fill_opacity?: number;
          });
          break;
        case "fly_to":
          handleFlyTo(map, action as unknown as {
            center: [number, number];
            zoom?: number;
            pitch?: number;
            bearing?: number;
          });
          break;
        case "add_layer":
          handleAddLayer(map, action as unknown as {
            layer_name: string;
            geometry: GeoJSON.FeatureCollection | GeoJSON.Feature;
            color?: string;
          });
          break;
        default:
          console.warn("Unknown map action type:", action.type);
      }
    },
    [map],
  );

  return { executeMapAction };
}

function handleMarker(map: MapLibreMap, data: MarkerData) {
  const { coordinates, label } = data;
  if (!coordinates || coordinates.length < 2) return;

  // Add a marker source + layer
  const sourceId = `geoai-marker-${Date.now()}`;
  const layerId = `${sourceId}-layer`;

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { label: label || "" },
    },
  });

  map.addLayer({
    id: layerId,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-radius": 10,
      "circle-color": "#3b82f6",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  // Add label if present
  if (label) {
    map.addLayer({
      id: `${layerId}-label`,
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": label,
        "text-offset": [0, 1.5],
        "text-anchor": "top",
        "text-size": 12,
      },
      paint: {
        "text-color": "#1e293b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    });
  }

  addedLayerIds.add(layerId);

  // Fly to the marker
  map.flyTo({
    center: coordinates,
    zoom: Math.max(map.getZoom(), 14),
    duration: 1000,
  });
}

function handleMultiMarker(
  map: MapLibreMap,
  data: { markers: MarkerData[] },
) {
  const { markers } = data;
  if (!markers?.length) return;

  const sourceId = `geoai-multi-marker-${Date.now()}`;
  const layerId = `${sourceId}-layer`;
  const labelLayerId = `${layerId}-label`;

  const features: GeoJSON.Feature[] = markers.map((m) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: m.coordinates },
    properties: { label: m.label || "" },
  }));

  map.addSource(sourceId, {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  map.addLayer({
    id: layerId,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-radius": 8,
      "circle-color": "#3b82f6",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });

  map.addLayer({
    id: labelLayerId,
    type: "symbol",
    source: sourceId,
    layout: {
      "text-field": ["get", "label"],
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-size": 11,
    },
    paint: {
      "text-color": "#1e293b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });

  addedLayerIds.add(layerId);

  // Fit bounds to show all markers
  if (features.length > 0) {
    const coords = features.map(
      (f) => (f.geometry as GeoJSON.Point).coordinates as [number, number],
    );
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 50, duration: 1000 },
    );
  }
}

function handleRoute(
  map: MapLibreMap,
  data: {
    coordinates: [number, number][];
    distance_meters?: number;
    duration_seconds?: number;
  },
) {
  const { coordinates } = data;
  if (!coordinates?.length) return;

  const sourceId = `geoai-route-${Date.now()}`;
  const layerId = `${sourceId}-layer`;

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {},
    },
  });

  map.addLayer({
    id: layerId,
    type: "line",
    source: sourceId,
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#3b82f6",
      "line-width": 4,
      "line-opacity": 0.8,
    },
  });

  addedLayerIds.add(layerId);

  // Fit to route bounds
  if (coordinates.length >= 2) {
    const lons = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 60, duration: 1000 },
    );
  }
}

function handlePolygon(
  map: MapLibreMap,
  data: {
    geometry: GeoJSON.Geometry;
    label?: string;
    color?: string;
    fill_opacity?: number;
  },
) {
  const { geometry, label, color = "#3b82f6", fill_opacity = 0.3 } = data;
  if (!geometry) return;

  const sourceId = `geoai-polygon-${Date.now()}`;
  const layerId = `${sourceId}-fill`;
  const borderId = `${sourceId}-border`;

  map.addSource(sourceId, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry,
      properties: { label: label || "" },
    },
  });

  map.addLayer({
    id: layerId,
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": color,
      "fill-opacity": fill_opacity,
    },
  });

  map.addLayer({
    id: borderId,
    type: "line",
    source: sourceId,
    paint: {
      "line-color": color,
      "line-width": 2,
    },
  });

  addedLayerIds.add(layerId);

  // Fly to polygon center (approximate)
  try {
    const coords = extractCoordinates(geometry);
    if (coords.length > 0) {
      const avgLon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
      const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
      map.flyTo({ center: [avgLon, avgLat], zoom: 14, duration: 1000 });
    }
  } catch {
    // Ignore fit errors
  }
}

function handleFlyTo(
  map: MapLibreMap,
  data: {
    center: [number, number];
    zoom?: number;
    pitch?: number;
    bearing?: number;
  },
) {
  map.flyTo({
    center: data.center,
    zoom: data.zoom ?? 14,
    pitch: data.pitch ?? 0,
    bearing: data.bearing ?? 0,
    duration: 1200,
  });
}

function handleAddLayer(
  map: MapLibreMap,
  data: {
    layer_name: string;
    geometry: GeoJSON.FeatureCollection | GeoJSON.Feature;
    color?: string;
  },
) {
  const { layer_name, geometry, color = "#10b981" } = data;
  const sourceId = `geoai-layer-${layer_name}-${Date.now()}`;
  const fillId = `${sourceId}-fill`;
  const lineId = `${sourceId}-line`;
  const circleId = `${sourceId}-circle`;

  map.addSource(sourceId, { type: "geojson", data: geometry });

  const geomType = geometry.type === "Feature"
    ? geometry.geometry?.type
    : geometry.type;

  if (geomType === "Point") {
    map.addLayer({
      id: circleId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 7,
        "circle-color": color,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    });
    addedLayerIds.add(circleId);
  } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": color, "fill-opacity": 0.3 },
    });
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: { "line-color": color, "line-width": 1.5 },
    });
    addedLayerIds.add(fillId);
  } else {
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: { "line-color": color, "line-width": 2 },
    });
    addedLayerIds.add(lineId);
  }
}

function extractCoordinates(geometry: GeoJSON.Geometry): [number, number][] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as [number, number]];
    case "LineString":
      return geometry.coordinates as [number, number][];
    case "Polygon":
      return geometry.coordinates[0] as [number, number][];
    case "MultiPoint":
      return geometry.coordinates as [number, number][];
    case "MultiLineString":
      return geometry.coordinates.flat() as [number, number][];
    case "MultiPolygon":
      return (geometry.coordinates[0]?.[0] ?? []) as [number, number][];
    default:
      return [];
  }
}

/**
 * Remove all AI-added layers and sources from the map.
 */
export function clearAiLayers(map: MapLibreMap | null) {
  if (!map) return;
  for (const layerId of addedLayerIds) {
    try {
      const layer = map.getLayer(layerId);
      if (layer) {
        const sourceId = layer.source;
        map.removeLayer(layerId);
        if (sourceId && map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      }
    } catch {
      // Layer might already be removed
    }
  }
  addedLayerIds.clear();
}
