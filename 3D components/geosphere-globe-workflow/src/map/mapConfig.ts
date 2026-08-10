import type { StyleSpecification } from "maplibre-gl";

export const MAP_PROJECTION = "globe" as const;
/** MapLibre switches to Mercator automatically around this zoom during the fly-in. */
export const MERCATOR_TRANSITION_ZOOM = 5;

/** Optional demo raster style from env - NOT the commercial basemap. */
export function envMapStyleUrl(): string | undefined {
  return import.meta.env.VITE_MAP_STYLE_URL?.trim() || undefined;
}
export function envMapAccessToken(): string | undefined {
  return import.meta.env.VITE_MAP_ACCESS_TOKEN?.trim() || undefined;
}

/**
 * Custom light style built entirely from the approved welcome-page palette.
 * No external tiles required: the globe (sphere + atmosphere) and the pale-blue
 * ocean + graticule render from style primitives alone.
 */
export const GLOBE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#dcebfb" },
    },
    // The sky (atmosphere) layer is a maplibre runtime extension that the style-spec
    // LayerSpecification union omits; cast it so the style still type-checks.
    {
      id: "atmosphere",
      type: "sky",
      paint: {
        "sky-type": "atmosphere",
        "sky-atmosphere-color": "rgba(220, 235, 251, 0.9)",
        "sky-atmosphere-halo-color": "rgba(214, 232, 250, 0.75)",
        "sky-atmosphere-sun": [0, -90],
        "sky-atmosphere-sun-intensity": 20,
      },
    } as unknown as NonNullable<StyleSpecification["layers"]>[number],
    {
      id: "ocean-fill",
      type: "fill",
      source: "ocean",
      paint: {
        "fill-color": "#bcd8f5",
        "fill-opacity": 0.9,
      },
    },
    {
      id: "graticule",
      type: "line",
      source: "graticule",
      paint: {
        "line-color": "rgba(53, 99, 233, 0.18)",
        "line-width": 0.5,
      },
      layout: { visibility: "visible" },
    },
  ],
};

/** Light local-map style used after the globe->Mercator transition (fallback when no env style). */
export const LOCAL_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e8f0fa" },
    },
    {
      id: "grid-minor",
      type: "line",
      source: "grid-minor",
      paint: {
        "line-color": "rgba(53, 99, 233, 0.10)",
        "line-width": 0.5,
      },
    },
    {
      id: "grid-major",
      type: "line",
      source: "grid-major",
      paint: {
        "line-color": "rgba(53, 99, 233, 0.16)",
        "line-width": 1,
      },
    },
  ],
};
