import type { StyleSpecification } from "maplibre-gl";

export const MAP_PROJECTION = "globe" as const;

/** Optional demo raster style from env - NOT the commercial basemap. */
export function envMapStyleUrl(): string | undefined {
  return import.meta.env.VITE_MAP_STYLE_URL?.trim() || undefined;
}

/**
 * Custom light style built entirely from the approved welcome-page palette.
 * No external tiles required: the globe renders from a bare background style + the
 * post-load ocean/graticule sources and layers (added once the map is ready), and the
 * atmosphere comes from MapLibre's setSky() API. Keeping the style minimal avoids the
 * bundled style validator rejecting sky/unsourced layers at load time.
 */
export const GLOBE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      // Transparent so only the globe sphere (+ its atmosphere halo) is visible and
      // the component floats on the page instead of sitting on a blue card.
      paint: { "background-color": "rgba(0, 0, 0, 0)" },
    },
  ],
};

/**
 * Soft pale-blue atmosphere for the globe. v6 renamed the sky spec properties:
 * the old `sky-atmosphere-*` names became `sky-color` / `horizon-color` / `fog-color`
 * + blend factors. `atmosphere-blend` controls how much pale-blue halo wraps the sphere.
 */
export const GLOBE_SKY = {
  // Transparent sky/fog so only the sphere + its halo are visible (no blue box).
  "sky-color": "rgba(0, 0, 0, 0)",
  "horizon-color": "rgba(53, 99, 233, 0.10)",
  "fog-color": "rgba(0, 0, 0, 0)",
  "sky-horizon-blend": 0.6,
  "horizon-fog-blend": 0.8,
  "atmosphere-blend": 0.45,
} as const;



