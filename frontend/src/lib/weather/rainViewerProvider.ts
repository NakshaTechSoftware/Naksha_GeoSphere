// RainViewer composite radar provider.
//
// Replaces the previous Goa-only IMD radar station visualization with a
// nationwide multi-radar composite sourced from the public RainViewer
// Weather Maps API (https://api.rainviewer.com/public/weather-maps.json).
//
// RainViewer aggregates radar data worldwide and serves it as raster XYZ
// tiles. We use the "past" + "nowcast" frame lists to build an animated
// observed-precipitation layer over the whole map viewport.

export const RAINVIEWER_API_URL = "https://api.rainviewer.com/public/weather-maps.json";

// While Radar is enabled we refresh the weather-maps.json metadata every 5
// minutes to pick up new frames and the latest "now" tile.
export const RAINVIEWER_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Default playback speed per frame (400–600 ms per the spec).
export const RAINVIEWER_FRAME_INTERVAL_MS = 500;

// Tile rendering options baked into the URL:
//   /512/{z}/{x}/{y}/{opacity}/{rainType}.png
//   opacity: 0 transparent, 1 = 50%, 2 = 100%
//   rainType: 1_1 = rain + snow combined
const RAINVIEWER_TILE_OPACITY = 2;
const RAINVIEWER_TILE_RAIN_TYPE = "1_1";

export interface RainViewerRadarFrame {
  /** Unix epoch seconds as returned by RainViewer. */
  time: number;
  /** Tile path prefix, e.g. "/v2/radar/<hash>". */
  path: string;
  /** ISO timestamp in IST for display. */
  timeIst: string;
}

export interface RainViewerWeatherMaps {
  /** Tile host, e.g. "https://tilecache.rainviewer.com". */
  host: string;
  /** Combined chronological frames (past then nowcast). */
  frames: RainViewerRadarFrame[];
  /** True if the API returned at least one frame. */
  hasData: boolean;
}

interface RainViewerRawFrame {
  time: number;
  path: string;
}

interface RainViewerRawResponse {
  host: string;
  radar?: {
    past?: RainViewerRawFrame[];
    nowcast?: RainViewerRawFrame[];
  };
}

const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  day: "numeric",
  month: "short",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/** Format a frame timestamp for date+time display in IST. */
export function formatRadarDateTimeIST(unixSeconds: number): string {
  return IST_FORMATTER.format(new Date(unixSeconds * 1000));
}

/** Format a frame timestamp for time-only display in IST. */
export function formatRadarTimeIST(unixSeconds: number): string {
  return IST_TIME_FORMATTER.format(new Date(unixSeconds * 1000));
}

/** Fetch and normalize the RainViewer weather-maps metadata. */
export async function fetchRainViewerWeatherMaps(
  signal?: AbortSignal
): Promise<RainViewerWeatherMaps> {
  const response = await fetch(RAINVIEWER_API_URL, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`RainViewer API returned ${response.status}`);
  }

  const data = (await response.json()) as RainViewerRawResponse;
  const host = data.host ?? "https://tilecache.rainviewer.com";
  const past = data.radar?.past ?? [];
  const nowcast = data.radar?.nowcast ?? [];

  // Build a single chronological list: past frames first, then nowcast.
  const combined: RainViewerRawFrame[] = [...past, ...nowcast];

  const frames: RainViewerRadarFrame[] = combined.map((frame) => ({
    time: frame.time,
    path: frame.path,
    timeIst: formatRadarDateTimeIST(frame.time),
  }));

  return {
    host,
    frames,
    hasData: frames.length > 0,
  };
}

/**
 * Build an XYZ tile URL for a given RainViewer frame and web-mercator tile.
 * Exact structure from the RainViewer API docs:
 *   {host}{path}/512/{z}/{x}/{y}/{opacity}/{rainType}.png
 */
export function buildRainViewerTileUrl(
  host: string,
  path: string,
  z: string | number,
  x: string | number,
  y: string | number
): string {
  return `${host}${path}/512/${z}/${x}/${y}/${RAINVIEWER_TILE_OPACITY}/${RAINVIEWER_TILE_RAIN_TYPE}.png`;
}

/** Combine past + nowcast frames into a single sorted list (helper). */
export function combineRadarFrames(
  past: RainViewerRawFrame[] = [],
  nowcast: RainViewerRawFrame[] = []
): RainViewerRadarFrame[] {
  return [...past, ...nowcast].map((frame) => ({
    time: frame.time,
    path: frame.path,
    timeIst: formatRadarDateTimeIST(frame.time),
  }));
}
