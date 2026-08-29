import type { Map as MapLibreMap } from "maplibre-gl";

export const INDIA_DEM_SOURCE_ID = "public-dem";
export const INDIA_TERRAIN_BACKGROUND_LAYER_ID = "local-terrain-background";
export const INDIA_DEM_COLOR_LAYER_ID = "local-dem-color-layer";
export const INDIA_HILLSHADE_LAYER_ID = "local-dem-hillshade";

// AWS's public "elevation-tiles-prod" bucket (the former Mapzen/Tilezen Joerd dataset,
// now hosted under the AWS Open Data Sponsorship Program - see
// https://registry.opendata.aws/terrain-tiles/). Worldwide coverage blended from SRTM,
// ETOPO1, ArcticDEM and others, zoom 0-15, free, no API key, CORS-enabled. Replaces the
// old local-file DEM pipeline (India_DEM.tif) that required a multi-GB asset to be
// present on the server and produced 500s + a "Terrain unavailable" notice when it wasn't.
const TERRARIUM_TILES_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

// Deliberately no map.setTerrain() here: real 3D mesh displacement forces MapLibre to
// re-tessellate the DEM mesh and re-run elevation queries on every pan/zoom, which was
// the actual source of the panning/zooming lag users hit in Terrain mode. The explore
// map is used top-down (pitch 0) here, not tilted, so the displacement was invisible
// anyway - color-relief + hillshade alone already produce the full shaded-relief look
// at a fraction of the cost. (Camera pitch used elsewhere, e.g. turn-by-turn navigation,
// is unaffected - that's just camera tilt and doesn't need a terrain mesh.)
export function removeIndiaTerrain(map: MapLibreMap): void {
  if (map.getTerrain()?.source === INDIA_DEM_SOURCE_ID) map.setTerrain(null);
}

export function addIndiaTerrain(map: MapLibreMap, beforeId?: string): void {
  map.addSource(INDIA_DEM_SOURCE_ID, {
    type: "raster-dem",
    tiles: [TERRARIUM_TILES_URL],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 15,
    encoding: "terrarium",
    attribution: '<a href="https://github.com/tilezen/joerd/blob/master/docs/data-sources.md">Tilezen Joerd</a>',
  });

  map.addLayer(
    {
      id: INDIA_TERRAIN_BACKGROUND_LAYER_ID,
      type: "background",
      paint: { "background-color": "#d9edf2" },
    },
    beforeId,
  );

  // Hypsometric tint rendered directly from the DEM by MapLibre's color-relief layer
  // (5.6+) - no server-side pre-colorized tileset needed. Lowlands begin blue/cyan, then
  // transition through green, yellow, orange and red to alpine white; matches
  // TerrainLegend's gradient/stops 1:1. Hillshade above it supplies the terrain texture.
  // Shares the one DEM source with the hillshade layer below - safe now that neither is
  // also feeding map.setTerrain (that combination is what MapLibre warns against).
  map.addLayer(
    {
      id: INDIA_DEM_COLOR_LAYER_ID,
      type: "color-relief",
      source: INDIA_DEM_SOURCE_ID,
      minzoom: 0,
      paint: {
        "color-relief-opacity": 0.96,
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          -500, "rgb(18, 50, 170)",
          0, "rgb(20, 112, 220)",
          100, "rgb(12, 190, 222)",
          300, "rgb(21, 210, 167)",
          600, "rgb(55, 196, 92)",
          1000, "rgb(155, 205, 65)",
          1500, "rgb(245, 220, 70)",
          2500, "rgb(255, 153, 45)",
          4000, "rgb(235, 67, 35)",
          6000, "rgb(166, 24, 38)",
          8600, "rgb(255, 250, 245)",
        ],
      },
    },
    beforeId,
  );

  map.addLayer(
    {
      id: INDIA_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: INDIA_DEM_SOURCE_ID,
      minzoom: 0,
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
}
