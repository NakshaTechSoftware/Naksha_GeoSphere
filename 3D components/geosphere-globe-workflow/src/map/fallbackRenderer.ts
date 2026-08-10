import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Ensures the map never shows a blank rectangle: if the optional external style fails to
 * load, we switch to the local pale-blue style with grid + simplified geography already
 * wired to the GeoJSON sources added by the app.
 */
export function applyFallbackMap(map: MapLibreMap): void {
  const style = map.getStyle();
  const hasBg = style?.layers?.some((l) => l.type === "background");
  if (!hasBg) {
    console.warn("[fallback] external style unavailable - using local pale-blue canvas");
    map.setStyle(
      {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#e8f0fa" },
          },
        ],
      },
      { diff: false }
    );
  }
}

/** Called when a style load errors - swap to the safe local style. */
export function bindFallbackHandler(map: MapLibreMap): void {
  map.on("error", (_e) => {
    // Style errors surface as ErrorEvent on the map; keep going with the fallback.
    if (!map.isStyleLoaded()) applyFallbackMap(map);
    // Ignore tile load failures for external providers.
  });
}
