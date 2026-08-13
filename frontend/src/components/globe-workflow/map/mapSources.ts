import type { Map as MapLibreMap, LayerSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { GEO_LAYER_IDS } from "./geographyLayers";

export const SOURCE_IDS = {
  ocean: "ocean",
  graticule: "graticule",
  worldLand: "world-land",
  indiaBoundary: "india-boundary",
  indiaStates: "india-states",
  karnataka: "karnataka",
  localGridMinor: "grid-minor",
  localGridMajor: "grid-major",
  aoi: "aoi",
  aoiFill: "aoi-fill",
  satellite: "satellite",
} as const;

/**
 * Satellite imagery for the local city stage. ESRI World Imagery needs no API key and
 * is free for non-commercial/demo use - perfect for this isolated prototype. NOT the
 * final commercial basemap (see GEODATA_SOURCES.md). If the tiles are unreachable the
 * pale-blue fallback canvas simply shows through (graceful degradation).
 */
const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

/**
 * Adds the satellite basemap (raster tiles + a soft pale-blue wash so the imagery sits
 * inside the component's light theme). Both layers fade in by zoom, so they only appear
 * once the camera reaches the local city stage and automatically fade out on reset.
 * Inserted ABOVE the globe ocean fill but BELOW the AOI overlays.
 */
export function addSatelliteLayers(map: MapLibreMap): void {
  if (!map.getSource(SOURCE_IDS.satellite)) {
    map.addSource(SOURCE_IDS.satellite, {
      type: "raster",
      tiles: SATELLITE_TILES,
      tileSize: 256,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    });
  }

  const satelliteLayer: LayerSpecification = {
    id: "satellite-raster",
    type: "raster",
    source: SOURCE_IDS.satellite,
    paint: {
      // Real Earth colors on the globe from the first frame (zoom 0), staying fully
      // visible through the dive to the local city.
      "raster-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.92, 3, 0.96, 7, 0.98, 9, 0.98],
      // brightness must stay within [0, 1] or maplibre silently drops the layer.
      "raster-brightness-max": 1.0,
      "raster-saturation": 0,
      "raster-contrast": 0.05,
    },
  };

  // Barely-there wash so the white UI panels stay readable over the imagery without
  // washing out the actual satellite colors.
  const tintLayer: LayerSpecification = {
    id: "satellite-tint",
    type: "fill",
    source: SOURCE_IDS.ocean, // world-covering polygon already present
    paint: {
      "fill-color": "rgba(214, 232, 250, 0.08)",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 7, 1],
    },
  };

  // Insert BELOW the India/Karnataka highlight layers (so the demo's cobalt outlines
  // stay visible on top of the imagery) but above the globe ocean/land base.
  const beforeId = GEO_LAYER_IDS.indiaStatesFill;
  if (!map.getLayer(satelliteLayer.id)) map.addLayer(satelliteLayer, beforeId);
  if (!map.getLayer(tintLayer.id)) map.addLayer(tintLayer, beforeId);
}

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

/** Adds the globe-primitive LAYERS (ocean fill + graticule) once their sources exist. */
export function addGlobeLayers(map: MapLibreMap): void {
  const spec: LayerSpecification[] = [
    {
      id: "globe-ocean",
      type: "fill",
      source: SOURCE_IDS.ocean,
      paint: {
        // Realistic deep-ocean blue, shown only where the satellite tiles haven't
        // arrived yet (the imagery itself covers the sphere once loaded).
        "fill-color": "#1e5f9e",
        "fill-opacity": 0.92,
      },
    },
    {
      id: "globe-graticule",
      type: "line",
      source: SOURCE_IDS.graticule,
      layout: { visibility: "visible" },
      paint: {
        "line-color": "rgba(53, 99, 233, 0.10)",
        "line-width": 0.5,
      },
    },
  ];
  for (const layer of spec) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
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
