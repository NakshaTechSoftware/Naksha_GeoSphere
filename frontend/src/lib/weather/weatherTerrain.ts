import type { Map as MapLibreMap } from "maplibre-gl";

// Weather workspace terrain basemap: a clean topographic/relief canvas shown
// automatically whenever the Weather workspace is active, so temperature/rain/
// wind/cloud overlays sit on readable land+ocean context instead of bright
// satellite imagery or a blank canvas. Replaces the earlier Maps-For-Free
// raster relief implementation, whose tile pyramid is full of 404s over most
// of India at the zoom levels this app uses (verified against the live
// endpoint) and therefore rendered nothing.
//
// One `raster-dem` source feeds two native MapLibre layers - `color-relief`
// (hypsometric tint) and `hillshade` - stacked over a flat `background` layer
// that stands in for the ocean. No 3D terrain is enabled (see
// `removeIndiaTerrain` usage at the call site): this is a 2D cartographic
// effect only.

export const WEATHER_TERRAIN_DEM_SOURCE_ID = "weather-terrain-dem";
export const WEATHER_TERRAIN_OCEAN_LAYER_ID = "weather-terrain-ocean";
export const WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID = "weather-terrain-color-relief";
export const WEATHER_TERRAIN_HILLSHADE_LAYER_ID = "weather-terrain-hillshade";
export const WEATHER_TERRAIN_DETAIL_HILLSHADE_LAYER_ID = "weather-terrain-detail-hillshade";

export const WEATHER_TERRAIN_LAYER_IDS = [
  WEATHER_TERRAIN_OCEAN_LAYER_ID,
  WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID,
  WEATHER_TERRAIN_HILLSHADE_LAYER_ID,
] as const;

export type WeatherTerrainProviderName = "mapterhorn" | "reearth";

export type WeatherTerrainProvider = {
  name: WeatherTerrainProviderName;
  tiles: string[];
  tileSize: number;
  maxzoom: number;
  bounds: [number, number, number, number];
  attribution: string;
};

const DEFAULT_GLOBAL_BOUNDS: [number, number, number, number] = [-180, -85.0511287798066, 180, 85.0511287798066];

// Primary provider. Its TileJSON does not declare a maxzoom; probing the live
// endpoint shows real DEM data through z12 and 404s at z13, so that measured
// ceiling is used instead of guessing (never invent a maxzoom - only the
// provider's actual coverage).
const MAPTERHORN_TILEJSON_URL = "https://tiles.mapterhorn.com/tilejson.json";
const MAPTERHORN_MEASURED_MAXZOOM = 12;

// Fallback provider, used only if Mapterhorn's TileJSON is unreachable/invalid.
const REEARTH_TILEJSON_URL = "https://terrain.reearth.land/terrarium/ellipsoid/tilejson.json";
const REEARTH_MEASURED_MAXZOOM = 14;

const TILEJSON_FETCH_TIMEOUT_MS = 5000;

async function fetchTileJsonProvider(
  name: WeatherTerrainProviderName,
  tileJsonUrl: string,
  measuredMaxzoom: number,
): Promise<WeatherTerrainProvider | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TILEJSON_FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(tileJsonUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return null;

    const json = await response.json();
    if (!Array.isArray(json?.tiles) || json.tiles.length === 0) return null;

    return {
      name,
      tiles: json.tiles,
      tileSize: typeof json.tileSize === "number" ? json.tileSize : 512,
      maxzoom: typeof json.maxzoom === "number" ? json.maxzoom : measuredMaxzoom,
      bounds: Array.isArray(json.bounds) && json.bounds.length === 4 ? json.bounds : DEFAULT_GLOBAL_BOUNDS,
      attribution: typeof json.attribution === "string" ? json.attribution : "",
    };
  } catch {
    return null;
  }
}

let providerPromise: Promise<WeatherTerrainProvider | null> | null = null;

let normalColorReliefOpacity = 1;

/** Normal (non-temperature) color-relief opacity, captured when terrain is first created. */
export function getNormalColorReliefOpacity(): number {
  return normalColorReliefOpacity;
}

/**
 * Resolves which terrain DEM provider to use - Mapterhorn first, Re:Earth as a
 * verified fallback, or `null` if both are unreachable - by requesting each
 * provider's TileJSON. Cached for the session so repeated Weather workspace
 * toggles don't re-check the network every time.
 */
export function resolveWeatherTerrainProvider(): Promise<WeatherTerrainProvider | null> {
  if (!providerPromise) {
    providerPromise = (async () => {
      const primary = await fetchTileJsonProvider("mapterhorn", MAPTERHORN_TILEJSON_URL, MAPTERHORN_MEASURED_MAXZOOM);
      if (primary) return primary;
      return fetchTileJsonProvider("reearth", REEARTH_TILEJSON_URL, REEARTH_MEASURED_MAXZOOM);
    })();
  }
  return providerPromise;
}

/** Idempotently add the DEM source + ocean/color-relief/hillshade layers (hidden) if not already on the map. */
export function ensureWeatherTerrain(map: MapLibreMap, provider: WeatherTerrainProvider): void {
  if (map.getSource(WEATHER_TERRAIN_DEM_SOURCE_ID)) return;

  map.addSource(WEATHER_TERRAIN_DEM_SOURCE_ID, {
    type: "raster-dem",
    tiles: provider.tiles,
    tileSize: provider.tileSize,
    encoding: "terrarium",
    maxzoom: provider.maxzoom,
    bounds: provider.bounds,
    attribution: provider.attribution,
  });

  // Insert all three at the very bottom of the stack (below every boundary,
  // GIS overlay and weather layer) - each addLayer(..., beforeId) call with
  // the same original bottom-most layer id inserts just above the previous
  // insertion, so the three end up ordered ocean -> color-relief -> hillshade.
  const bottomLayerId = map.getStyle().layers?.[0]?.id;

  map.addLayer(
    {
      id: WEATHER_TERRAIN_OCEAN_LAYER_ID,
      type: "background",
      layout: { visibility: "none" },
      // Restrained blue-gray foundation - consistent across the Arabian Sea,
      // Bay of Bengal and Indian Ocean since it is a flat fill, not bathymetry.
      paint: { "background-color": "#a8c0cf" },
    },
    bottomLayerId,
  );

  map.addLayer(
    {
      id: WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID,
      type: "color-relief",
      source: WEATHER_TERRAIN_DEM_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "color-relief-opacity": 1,
        // Muted hypsometric tint. Ocean/below-sea-level elevations are fully
        // transparent so the flat ocean background layer shows through instead
        // of DEM bathymetry; land fades in from a soft coastal tone through
        // green, olive, ochre, brown to a pale desaturated highland tone.
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          -11000, "rgba(0,0,0,0)",
          -20, "rgba(0,0,0,0)",
          0, "rgba(222,209,176,0.35)",
          40, "rgba(210,225,175,0.65)",
          100, "rgba(206,224,172,0.88)",
          300, "rgba(184,210,150,0.9)",
          600, "rgba(163,189,118,0.9)",
          1000, "rgba(199,181,115,0.9)",
          1800, "rgba(200,155,95,0.9)",
          3000, "rgba(173,125,82,0.9)",
          4500, "rgba(139,106,82,0.88)",
          6500, "rgba(216,211,201,0.85)",
        ],
      },
    },
    bottomLayerId,
  );

  // Capture the normal (non-temperature) color-relief opacity so we can
  // restore it when leaving Temperature mode (section 19).
  normalColorReliefOpacity = Number(
    map.getPaintProperty(WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID, "color-relief-opacity")
  ) ?? 1;

  map.addLayer(
    {
      id: WEATHER_TERRAIN_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: WEATHER_TERRAIN_DEM_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "hillshade-exaggeration": 0.35,
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-altitude": 45,
        "hillshade-method": "multidirectional",
        "hillshade-shadow-color": "rgba(64,55,46,0.55)",
        "hillshade-highlight-color": "rgba(255,248,235,0.45)",
        "hillshade-accent-color": "rgba(120,110,96,0.3)",
      },
    },
    bottomLayerId,
  );

  // A second, subtle hillshade on the SAME DEM, floated above the temperature
  // raster (see `applyWeatherTerrainTemperatureMode`) so the land still has
  // relief even while the temperature colours dominate. Hidden by default -
  // only revealed in Temperature mode.
  map.addLayer(
    {
      id: WEATHER_TERRAIN_DETAIL_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: WEATHER_TERRAIN_DEM_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "hillshade-exaggeration": 0.34,
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-altitude": 42,
        "hillshade-method": "igor",
        "hillshade-shadow-color": "rgba(64,52,40,0.48)",
        "hillshade-highlight-color": "rgba(255,250,240,0.42)",
        "hillshade-accent-color": "rgba(110,98,84,0.24)",
      },
    },
    bottomLayerId,
  );
}

/** The scalar/animated raster layer, per weather mode, that the detail hillshade should float above.
 *  Temperature is intentionally absent: it now shows real NASA VIIRS Land
 *  Surface Temperature imagery, which has large transparent gaps (cloud mask,
 *  ocean, night side) - Mapterhorn terrain stays visible through those gaps
 *  for honest geographic context instead of a blank void. */
const FIELD_LAYER_ID_BY_MODE: Partial<Record<string, string>> = {
  wind: "gfs-wind-speed-layer",
};

/** How strongly to dim the hypsometric colour-relief so weather colour dominates, per mode. */
const COLOR_RELIEF_OPACITY_BY_MODE: Partial<Record<string, number>> = {
  wind: 0.05,
};

/**
 * Per-weather-mode terrain styling (section 26): Temperature and Wind dim the
 * hypsometric colour-relief so their own colours read clearly, and float the
 * detail hillshade above their respective raster so relief survives without
 * contaminating the weather hue. Every other mode (None/Rain/Clouds/AQI) keeps
 * the normal terrain. Idempotent - safe to call on every field re-render and
 * on terrain (re)activation. Does NOT create new sources, layers, or timers.
 *
 * Normal color-relief opacity is captured when the terrain is first created
 * (see `ensureWeatherTerrain`) and restored whenever `mode` falls outside
 * `COLOR_RELIEF_OPACITY_BY_MODE`.
 */
export function applyWeatherTerrainWeatherMode(map: MapLibreMap, mode: string): void {
  // Immediately return if map is absent, and check layer existence before every
  // MapLibre mutation - both terrain and the field/wind layers activate async
  // and may not exist yet on any given call.
  if (!map) return;

  let crLayer = false, detLayer = false;
  try { crLayer = !!map.getLayer(WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID); } catch {}
  try { detLayer = !!map.getLayer(WEATHER_TERRAIN_DETAIL_HILLSHADE_LAYER_ID); } catch {}

  const targetOpacity = COLOR_RELIEF_OPACITY_BY_MODE[mode];
  const fieldLayerId = FIELD_LAYER_ID_BY_MODE[mode];

  if (targetOpacity !== undefined) {
    // Diminish the hypsometric colour-relief so the weather colours read clearly.
    if (crLayer) {
      map.setPaintProperty(WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID, "color-relief-opacity", targetOpacity);
    }
    // Float the detail hillshade directly above this mode's raster so the
    // terrain keeps its relief without overwhelming the data.
    if (detLayer && fieldLayerId) {
      const detailId = WEATHER_TERRAIN_DETAIL_HILLSHADE_LAYER_ID;
      try {
        const layers = map.getStyle().layers ?? [];
        const fieldIdx = layers.findIndex((l: { id: string }) => l.id === fieldLayerId);
        if (fieldIdx >= 0 && fieldIdx < layers.length - 1) {
          const nextLayer = layers[fieldIdx + 1];
          if (nextLayer) map.moveLayer(detailId, nextLayer.id);
        } else {
          // No layer above the field layer yet (or field layer missing this tick) - move to top.
          map.moveLayer(detailId, undefined);
        }
      } catch {
        // Positioning failed silently; detail remains in whatever state it was.
      }
      try {
        map.setLayoutProperty(detailId, "visibility", "visible");
      } catch {}
    }
  } else {
    // Not a colour-relief-suppressing mode: restore normal terrain.
    if (crLayer) {
      map.setPaintProperty(WEATHER_TERRAIN_COLOR_RELIEF_LAYER_ID, "color-relief-opacity", normalColorReliefOpacity);
    }
    if (detLayer) {
      try {
        map.setLayoutProperty(WEATHER_TERRAIN_DETAIL_HILLSHADE_LAYER_ID, "visibility", "none");
      } catch {}
    }
  }
}

export function setWeatherTerrainVisible(map: MapLibreMap, visible: boolean): void {
  const visibility = visible ? "visible" : "none";
  for (const id of WEATHER_TERRAIN_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  }
}

/** True once the DEM source has finished loading the tiles needed for the current view. */
export function isWeatherTerrainReady(map: MapLibreMap): boolean {
  const source = map.getSource(WEATHER_TERRAIN_DEM_SOURCE_ID) as { loaded?: () => boolean } | undefined;
  return source?.loaded?.() ?? false;
}
