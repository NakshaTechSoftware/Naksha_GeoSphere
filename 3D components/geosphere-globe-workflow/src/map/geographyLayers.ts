import type { Map as MapLibreMap, LayerSpecification, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

export const GEO_LAYER_IDS = {
  indiaBoundary: "geo-india-boundary",
  indiaStates: "geo-india-states",
  indiaStatesFill: "geo-india-states-fill",
  karnataka: "geo-karnataka",
  karnatakaFill: "geo-karnataka-fill",
  aoiLine: "geo-aoi-line",
  aoiFill: "geo-aoi-fill",
  aoiVertices: "geo-aoi-vertices",
} as const;

export function addGeographyLayers(map: MapLibreMap): void {
  const spec: LayerSpecification[] = [
    {
      id: GEO_LAYER_IDS.indiaStatesFill,
      type: "fill",
      source: "india-states",
      layout: { visibility: "none" },
      paint: {
        "fill-color": "#3563e9",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.03, 3.5, 0.05],
      },
    },
    {
      id: GEO_LAYER_IDS.indiaStates,
      type: "line",
      source: "india-states",
      layout: { visibility: "none" },
      paint: {
        "line-color": "rgba(53, 99, 233, 0.35)",
        "line-width": 0.5,
      },
    },
    {
      id: GEO_LAYER_IDS.indiaBoundary,
      type: "line",
      source: "india-boundary",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#3563e9",
        "line-width": 1.2,
        "line-opacity": 0.9,
      },
    },
    {
      id: GEO_LAYER_IDS.karnatakaFill,
      type: "fill",
      source: "karnataka",
      layout: { visibility: "none" },
      paint: {
        "fill-color": "#3563e9",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2.5, 0.05, 4.5, 0.12],
      },
    },
    {
      id: GEO_LAYER_IDS.karnataka,
      type: "line",
      source: "karnataka",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#3563e9",
        "line-width": 1.6,
        "line-opacity": 0.95,
      },
    },
    {
      id: GEO_LAYER_IDS.aoiFill,
      type: "fill",
      source: "aoi",
      layout: { visibility: "none" },
      paint: {
        "fill-color": "#3563e9",
        "fill-opacity": 0.24,
      },
    },
    {
      id: GEO_LAYER_IDS.aoiLine,
      type: "line",
      source: "aoi",
      layout: { visibility: "none" },
      paint: {
        "line-color": "#3563e9",
        "line-width": 2.5,
        "line-opacity": 0.95,
      },
    },
    {
      id: GEO_LAYER_IDS.aoiVertices,
      type: "circle",
      source: "aoi",
      layout: { visibility: "none" },
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 3.5,
        "circle-stroke-color": "#3563e9",
        "circle-stroke-width": 1.5,
      },
    },
  ];
  for (const layer of spec) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}

export function setLayerVisibility(map: MapLibreMap, id: string, visible: boolean): void {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

export function setSource(map: MapLibreMap, id: string, data: FeatureCollection): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src && typeof src.setData === "function") src.setData(data);
  else if (!map.getSource(id)) map.addSource(id, { type: "geojson", data });
}
