import type { Map as MapLibreMap } from "maplibre-gl";

export const INDIA_DEM_SOURCE_ID = "local-dem";
export const INDIA_DEM_COLOR_SOURCE_ID = "local-dem-color";
// Separate raster-dem source for the hillshade layer: MapLibre warns (and renders worse)
// when the 3D terrain source is also used by a hillshade layer, so each gets its own.
export const INDIA_DEM_HILLSHADE_SOURCE_ID = "local-dem-hillshade";
export const INDIA_TERRAIN_BACKGROUND_LAYER_ID = "local-terrain-background";
export const INDIA_DEM_COLOR_LAYER_ID = "local-dem-color-layer";
export const INDIA_HILLSHADE_LAYER_ID = "local-dem-hillshade";

export function removeIndiaTerrain(map: MapLibreMap): void {
  if (map.getTerrain()?.source === INDIA_DEM_SOURCE_ID) map.setTerrain(null);
}

export function addIndiaTerrain(map: MapLibreMap, beforeId?: string): void {
  map.addSource(INDIA_DEM_SOURCE_ID, {
    type: "raster-dem",
    tiles: ["/api/terrain/{z}/{x}/{y}?v=3"],
    tileSize: 256,
    minzoom: 4,
    maxzoom: 12,
    encoding: "mapbox",
    attribution: "India SRTM 30 m DEM",
  });
  map.addSource(INDIA_DEM_COLOR_SOURCE_ID, {
    type: "raster",
    tiles: ["/api/terrain/{z}/{x}/{y}?mode=color&v=3"],
    tileSize: 256,
    minzoom: 4,
    maxzoom: 12,
    attribution: "India SRTM 30 m DEM",
  });
  map.addSource(INDIA_DEM_HILLSHADE_SOURCE_ID, {
    type: "raster-dem",
    tiles: ["/api/terrain/{z}/{x}/{y}?v=3"],
    tileSize: 256,
    minzoom: 4,
    maxzoom: 12,
    encoding: "mapbox",
    attribution: "India SRTM 30 m DEM",
  });

  map.addLayer(
    {
      id: INDIA_TERRAIN_BACKGROUND_LAYER_ID,
      type: "background",
      paint: { "background-color": "#d9edf2" },
    },
    beforeId,
  );

  // Hypsometric tint: lowlands begin blue/cyan, then transition through green, yellow,
  // orange and red to alpine white. Hillshade above it supplies the terrain texture.
  map.addLayer(
    {
      id: INDIA_DEM_COLOR_LAYER_ID,
      type: "raster",
      source: INDIA_DEM_COLOR_SOURCE_ID,
      minzoom: 4,
      paint: {
        "raster-opacity": 0.96,
        "raster-resampling": "linear",
        "raster-fade-duration": 0,
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: INDIA_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: INDIA_DEM_HILLSHADE_SOURCE_ID,
      minzoom: 4,
      paint: {
        "hillshade-exaggeration": 0.72,
        "hillshade-shadow-color": "rgba(18, 28, 30, 0.62)",
        "hillshade-highlight-color": "rgba(255, 255, 245, 0.5)",
        "hillshade-accent-color": "rgba(76, 55, 38, 0.45)",
        "hillshade-illumination-direction": 315,
      },
    },
    beforeId,
  );

  map.setTerrain({ source: INDIA_DEM_SOURCE_ID, exaggeration: 1 });
}
