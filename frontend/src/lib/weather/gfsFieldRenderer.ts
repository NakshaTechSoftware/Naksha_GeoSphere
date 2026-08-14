interface ColorStop {
  value: number;
  rgb: [number, number, number];
  alpha: number;
}

import type { AqiGridResponse, GfsWeatherFieldFrameResponse } from "@/types/environment";
import type { Map as MapLibreMap } from "maplibre-gl";

type Colormap = ColorStop[];

const TEMPERATURE_COLORMAP: Colormap = [
  { value: -50, rgb: [0, 0, 139], alpha: 255 },
  { value: -40, rgb: [0, 0, 180], alpha: 255 },
  { value: -30, rgb: [0, 50, 200], alpha: 255 },
  { value: -20, rgb: [0, 100, 255], alpha: 255 },
  { value: -10, rgb: [0, 150, 255], alpha: 255 },
  { value: 0, rgb: [0, 200, 255], alpha: 255 },
  { value: 10, rgb: [0, 255, 200], alpha: 255 },
  { value: 20, rgb: [255, 255, 0], alpha: 255 },
  { value: 30, rgb: [255, 165, 0], alpha: 255 },
  { value: 40, rgb: [255, 100, 0], alpha: 255 },
  { value: 50, rgb: [255, 0, 0], alpha: 255 },
];

const PRECIPITATION_COLORMAP: Colormap = [
  { value: 0, rgb: [222, 235, 247], alpha: 0 },
  { value: 0.1, rgb: [222, 235, 247], alpha: 120 },
  { value: 0.5, rgb: [158, 202, 225], alpha: 170 },
  { value: 1, rgb: [99, 159, 205], alpha: 210 },
  { value: 2.5, rgb: [50, 117, 178], alpha: 235 },
  { value: 5, rgb: [8, 81, 156], alpha: 245 },
  { value: 10, rgb: [3, 19, 92], alpha: 255 },
];

const CLOUD_COLORMAP: Colormap = [
  { value: 0, rgb: [255, 255, 255], alpha: 0 },
  { value: 10, rgb: [245, 247, 250], alpha: 28 },
  { value: 40, rgb: [220, 224, 232], alpha: 110 },
  { value: 70, rgb: [180, 186, 200], alpha: 165 },
  { value: 100, rgb: [120, 126, 142], alpha: 215 },
];

function sampleColormap(
  stops: Colormap,
  value: number | undefined
): [number, number, number, number] {
  if (value == null || Number.isNaN(value)) {
    return [0, 0, 0, 0];
  }
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) {
    return [0, 0, 0, 0];
  }
  if (value <= first.value) {
    return [first.rgb[0], first.rgb[1], first.rgb[2], first.alpha];
  }
  if (value >= last.value) {
    return [last.rgb[0], last.rgb[1], last.rgb[2], last.alpha];
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!a || !b) continue;
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
        Math.round(a.alpha + (b.alpha - a.alpha) * t),
      ];
    }
  }
  return [0, 0, 0, 0];
}

function colormapForVariable(
  variable: "temperature" | "precipitation" | "clouds"
): Colormap {
  if (variable === "temperature") return TEMPERATURE_COLORMAP;
  if (variable === "precipitation") return PRECIPITATION_COLORMAP;
  return CLOUD_COLORMAP;
}

export interface FieldLegendStop {
  value: number;
  color: string;
  alpha: number;
}

export function fieldLegendStops(
  variable: "temperature" | "precipitation" | "clouds"
): FieldLegendStop[] {
  return colormapForVariable(variable).map((s) => ({
    value: s.value,
    alpha: s.alpha,
    color: `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]})`,
  }));
}

export function fieldUnit(variable: "temperature" | "precipitation" | "clouds"): string {
  if (variable === "temperature") return "°C";
  if (variable === "precipitation") return "mm/h";
  return "%";
}

export const FIELD_UPSAMPLE = 4;

/**
 * Render a GFS scalar field frame into a MapLibre-compatible raster image
 * source.  The function paints the GFS grid (at native 0.25° resolution) onto a
 * canvas and returns the data-URL plus the 4 corner coordinates MapLibre needs
 * for its `image` source type.
 *
 * Because the grid itself is rendered into a static image, zooming and panning
 * are handled entirely by MapLibre's WebGL raster layer — no per-pixel
 * `unproject()` calls, no JavaScript re-render on viewport change.  This gives
 * the same smooth zoom/pan behaviour as a tile layer.
 *
 * The image is kept at native GFS resolution (1440×721) to avoid exceeding
 * data-URL size limits.  MapLibre's `raster-resampling: "linear"` paint
 * property handles bilinear interpolation when the map is zoomed.
 */
export function renderFieldToImageSource(
  frame: {
    width: number;
    height: number;
    dx: number;
    dy: number;
    bounds: { west: number; south: number; east: number; north: number };
    values: number[];
    variable: "temperature" | "precipitation" | "clouds";
  },
  globalOpacity: number
): { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null {
  const { width, height, values, bounds, variable } = frame;
  const stops = colormapForVariable(variable);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = sampleColormap(stops, values[i]);
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = Math.round((a / 255) * globalOpacity * 255);
  }
  ctx.putImageData(img, 0, 0);

  const url = canvas.toDataURL();

  // Clip latitude to Web Mercator bounds (±85.05°) to avoid Infinity
  // in MapLibre's tile coordinate calculations.
  const MERCATOR_MAX_LAT = 85.05;
  const north = Math.min(bounds.north, MERCATOR_MAX_LAT);
  const south = Math.max(bounds.south, -MERCATOR_MAX_LAT);

  // MapLibre `image` source expects 4 corner coordinates in clockwise order:
  //   top-left  →  top-right  →  bottom-right  →  bottom-left
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [bounds.west, north],  // top-left
    [bounds.east, north],  // top-right
    [bounds.east, south],  // bottom-right
    [bounds.west, south],  // bottom-left
  ];

  return { url, coordinates };
}

/**
 * Bilinear sample of the GFS grid (regular lat/lon, row-major, south→north)
 * at an arbitrary geographic coordinate. Returns null if the point is outside
 * the grid.
 */
export function sampleFieldValue(
  frame: {
    width: number;
    height: number;
    dx: number;
    dy: number;
    bounds: { west: number; south: number; east: number; north: number };
    values: number[];
  },
  longitude: number,
  latitude: number
): number | null {
  const { width, height, dx, dy, bounds, values } = frame;

  // Normalize longitude to [0, 360) for global handling.
  let lon = longitude;
  while (lon < 0) lon += 360;
  while (lon >= 360) lon -= 360;

  // Calculate x relative to the grid's west bound, wrapping if needed.
  // The grid's valid x range is [0, width-1] corresponding to [bounds.west, bounds.east].
  // We normalize lon so that it falls within one period of the grid's longitude range.
  const gridWest = bounds.west;
  const gridEast = bounds.east;
  const gridSpan = gridEast - gridWest; // positive (e.g., 35 for India 65->100)

  // Bring lon into the grid's first period: [gridWest, gridWest + gridSpan)
  // Handle the case where gridSpan could be negative (wrap-around longitude domain)
  let relLon = lon - gridWest;
  // Wrap relLon into [0, gridSpan) using modulo-like behavior
  if (gridSpan > 0) {
    relLon = ((relLon % gridSpan) + gridSpan) % gridSpan;
  } else {
    // Negative gridSpan means the grid wraps across the 0/360 boundary;
    // for the India case (65->100, positive span) this branch is unlikely.
    relLon = (relLon % gridSpan + gridSpan) % gridSpan;
  }

  const x = relLon / dx;
  const y = (latitude - bounds.south) / dy;
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return null;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const q11 = values[y0 * width + x0] ?? 0;
  const q21 = values[y0 * width + x1] ?? 0;
  const q12 = values[y1 * width + x0] ?? 0;
  const q22 = values[y1 * width + x1] ?? 0;

  const a = q11 * (1 - tx) + q21 * tx;
  const b = q12 * (1 - tx) + q22 * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * High-DPI WebMercator-sampled renderer for GFS scalar fields. Renders the
 * field onto a canvas the size of the live map viewport (at devicePixelRatio)
 * by sampling the GFS grid through the map's projection per pixel — exactly
 * the proven per-pixel projection pattern used by the NOAA wind animator.
 * This avoids the blur of stretching a single low-res image across India.
 */
export class GfsFieldCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private map: MapLibreMap | null = null;
  private frame: GfsWeatherFieldFrameResponse | null = null;
  private opacity: number;
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 1;
  private dirty = false;
  private rafId: number | null = null;

  constructor(
    frame: GfsWeatherFieldFrameResponse | null,
    opacity: number
  ) {
    this.opacity = opacity;
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "12";
    this.canvas.style.imageRendering = "auto";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable for GFS field renderer.");
    }
    this.ctx = ctx;
    if (frame) this.frame = frame;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  attachTo(container: HTMLElement): void {
    if (this.canvas.parentElement !== container) {
      container.appendChild(this.canvas);
    }
  }

  detach(): void {
    this.canvas.remove();
  }

  setMap(map: MapLibreMap): void {
    this.map = map;
  }

  setFrame(frame: GfsWeatherFieldFrameResponse): void {
    this.frame = frame;
    this.dirty = true;
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.dirty = true;
  }

  /**
   * Mark the canvas as needing a re-render on the next animation frame.
   * Call this on every map move/zoom so the field stays pinned to the viewport.
   */
  markDirty(): void {
    this.dirty = true;
  }

  resize(width: number, height: number, pixelRatio = window.devicePixelRatio || 1): void {
    const nextCssWidth = Math.max(1, Math.round(width));
    const nextCssHeight = Math.max(1, Math.round(height));
    const nextPixelRatio = Math.max(1, pixelRatio);
    const nextWidth = Math.round(nextCssWidth * nextPixelRatio);
    const nextHeight = Math.round(nextCssHeight * nextPixelRatio);
    if (
      this.canvas.width === nextWidth &&
      this.canvas.height === nextHeight &&
      this.cssWidth === nextCssWidth &&
      this.cssHeight === nextCssHeight &&
      this.pixelRatio === nextPixelRatio
    ) {
      return;
    }
    this.cssWidth = nextCssWidth;
    this.cssHeight = nextCssHeight;
    this.pixelRatio = nextPixelRatio;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.dirty = true;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(this.render);
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.detach();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private render = (): void => {
    this.rafId = null;
    if (this.dirty && this.frame && this.map && this.map.isStyleLoaded()) {
      this.renderFrame();
      this.dirty = false;
    }
    // Only keep ticking while the field is active; callers restart via start()
    // after setting new frames / resizing. This avoids a perpetual rAF loop.
  };

  private renderFrame(): void {
    if (!this.frame || !this.map) return;
    const physicalWidth = this.canvas.width;
    const physicalHeight = this.canvas.height;
    const stops = colormapForVariable(this.frame.variable);

    // Render at reduced resolution for performance, then upscale with bilinear
    // smoothing.  At renderScale=2 we process 4× fewer pixels (each unproject
    // is an expensive matrix multiply), making pan/zoom responsive.
    const renderScale = 2;
    const rw = Math.max(1, Math.ceil(physicalWidth / renderScale));
    const rh = Math.max(1, Math.ceil(physicalHeight / renderScale));

    const small = document.createElement("canvas");
    small.width = rw;
    small.height = rh;
    const sctx = small.getContext("2d");
    if (!sctx) return;

    const imageData = sctx.createImageData(rw, rh);
    const data = imageData.data;

    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const canvasX = ((px * renderScale) + 0.5) / this.pixelRatio;
        const canvasY = ((py * renderScale) + 0.5) / this.pixelRatio;
        const pt = this.map.unproject([canvasX, canvasY]);
        const value = sampleFieldValue(this.frame, pt.lng, pt.lat);
        const [r, g, b, a] = sampleColormap(stops, value ?? undefined);
        const o = (py * rw + px) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = Math.round((a / 255) * this.opacity * 255);
      }
    }

    sctx.putImageData(imageData, 0, 0);

    // Upscale to the full canvas with bilinear interpolation for smooth results.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.clearRect(0, 0, physicalWidth, physicalHeight);
    this.ctx.drawImage(small, 0, 0, physicalWidth, physicalHeight);
  }
}

// --- Air Quality colormap ---------------------------------------------------

const AQI_COLORMAP: Colormap = [
  { value: 0, rgb: [0, 168, 190], alpha: 0 }, // transparent for missing
  { value: 0, rgb: [0, 168, 190], alpha: 230 }, // Good — teal
  { value: 51, rgb: [140, 208, 0], alpha: 230 }, // Satisfactory — green
  { value: 101, rgb: [255, 242, 0], alpha: 240 }, // Moderate — yellow
  { value: 151, rgb: [255, 150, 0], alpha: 240 }, // Poor — orange
  { value: 201, rgb: [232, 24, 45], alpha: 250 }, // Very Poor — red
  { value: 301, rgb: [126, 0, 128], alpha: 255 }, // Severe — purple
  { value: 401, rgb: [76, 0, 93], alpha: 255 }, // Hazardous — maroon
];

export function aqiLegendStops(): FieldLegendStop[] {
  const labels = ["Good (0-50)", "Satisfactory (51-100)", "Moderate (101-150)", "Poor (151-200)", "Very Poor (201-300)", "Severe (301-400)", "Hazardous (401+)"];
  return labels.map((label, i) => ({ value: i, color: `rgb(0,0,0)`, alpha: 0, label }));
}

/** Bilinear sample of a regular lat/lon gridded data array. */
function sampleGridValue(
  grid: {
    width: number;
    height: number;
    dx: number;
    dy: number;
    bounds: { west: number; south: number; east: number; north: number };
    values: (number | null)[];
  },
  longitude: number,
  latitude: number
): number | null {
  const { width, height, dx, dy, bounds, values } = grid;
  const x = (longitude - bounds.west) / dx;
  const y = (latitude - bounds.south) / dy;
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return null;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const q11 = values[y0 * width + x0];
  const q21 = values[y0 * width + x1];
  const q12 = values[y1 * width + x0];
  const q22 = values[y1 * width + x1];

  if (q11 == null || q21 == null || q12 == null || q22 == null) return null;
  const a = q11 * (1 - tx) + q21 * tx;
  const b = q12 * (1 - tx) + q22 * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * High-DPI canvas renderer for the modeled air-quality grid surface. Samples
 * the ~1° gridded AQ data through the map projection per pixel (same
 * WebMercator pattern as GfsFieldCanvasRenderer), coloring each pixel by the
 * US AQI colormap.
 */
export class AqiGridCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private map: MapLibreMap | null = null;
  private grid: AqiGridResponse | null = null;
  private opacity: number;
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 1;
  private dirty = false;
  private rafId: number | null = null;

  constructor(opacity: number) {
    this.opacity = opacity;
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "11";
    this.canvas.style.imageRendering = "auto";
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable for AQ grid renderer.");
    }
    this.ctx = ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  attachTo(container: HTMLElement): void {
    if (this.canvas.parentElement !== container) {
      container.appendChild(this.canvas);
    }
  }

  detach(): void {
    this.canvas.remove();
  }

  setMap(map: MapLibreMap): void {
    this.map = map;
  }

  setGrid(grid: AqiGridResponse): void {
    this.grid = grid;
    this.dirty = true;
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.dirty = true;
  }

  /**
   * Mark the canvas as needing a re-render on the next animation frame.
   * Call this on every map move/zoom so the field stays pinned to the viewport.
   */
  markDirty(): void {
    this.dirty = true;
  }

  resize(width: number, height: number, pixelRatio = window.devicePixelRatio || 1): void {
    const nextCssWidth = Math.max(1, Math.round(width));
    const nextCssHeight = Math.max(1, Math.round(height));
    const nextPixelRatio = Math.max(1, pixelRatio);
    const nextWidth = Math.round(nextCssWidth * nextPixelRatio);
    const nextHeight = Math.round(nextCssHeight * nextPixelRatio);
    if (
      this.canvas.width === nextWidth &&
      this.canvas.height === nextHeight &&
      this.cssWidth === nextCssWidth &&
      this.cssHeight === nextCssHeight &&
      this.pixelRatio === nextPixelRatio
    ) {
      return;
    }
    this.cssWidth = nextCssWidth;
    this.cssHeight = nextCssHeight;
    this.pixelRatio = nextPixelRatio;
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.dirty = true;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(this.render);
  }

  stop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.detach();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private render = (): void => {
    this.rafId = null;
    if (this.dirty && this.grid && this.map && this.map.isStyleLoaded()) {
      this.renderGrid();
      this.dirty = false;
    }
  };

  private gridToArray(): { width: number; height: number; dx: number; dy: number; bounds: { west: number; south: number; east: number; north: number }; values: (number | null)[] } | null {
    if (!this.grid || this.grid.points.length === 0) return null;
    const { width, height, bounds } = this.grid;
    const values: (number | null)[] = [];
    for (const p of this.grid.points) {
      values.push(p.usAqi);
    }
    const dx = (bounds.east - bounds.west) / Math.max(1, width - 1);
    const dy = (bounds.north - bounds.south) / Math.max(1, height - 1);
    return { width, height, dx, dy, bounds, values };
  }

  private renderGrid(): void {
    if (!this.grid || !this.map) return;
    const gridArray = this.gridToArray();
    if (!gridArray) return;

    const physicalWidth = this.canvas.width;
    const physicalHeight = this.canvas.height;

    const renderScale = 2;
    const rw = Math.max(1, Math.ceil(physicalWidth / renderScale));
    const rh = Math.max(1, Math.ceil(physicalHeight / renderScale));

    const small = document.createElement("canvas");
    small.width = rw;
    small.height = rh;
    const sctx = small.getContext("2d");
    if (!sctx) return;

    const imageData = sctx.createImageData(rw, rh);
    const data = imageData.data;

    for (let py = 0; py < rh; py++) {
      for (let px = 0; px < rw; px++) {
        const canvasX = ((px * renderScale) + 0.5) / this.pixelRatio;
        const canvasY = ((py * renderScale) + 0.5) / this.pixelRatio;
        const pt = this.map.unproject([canvasX, canvasY]);
        const value = sampleGridValue(gridArray, pt.lng, pt.lat);
        const [r, g, b, a] = sampleColormap(AQI_COLORMAP, value ?? undefined);
        const o = (py * rw + px) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = Math.round((a / 255) * this.opacity * 255);
      }
    }

    sctx.putImageData(imageData, 0, 0);

    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
    this.ctx.clearRect(0, 0, physicalWidth, physicalHeight);
    this.ctx.drawImage(small, 0, 0, physicalWidth, physicalHeight);
  }
}

// Re-exported types for the canvas renderers.
export type { GfsWeatherFieldFrameResponse as GfsWeatherFieldFrameType } from "@/types/environment";
export type { AqiGridResponse } from "@/types/environment";
