/**
 * NOAA GFS scalar field renderer for temperature, precipitation, and clouds.
 *
 * This module renders the GFS 0.25° scalar grids as MapLibre raster layers.
 * The data is painted into canvases and served as image sources, giving
 * smooth zoom/pan through MapLibre's WebGL raster layer (no JS redraws).
 *
 * Supports high-DPI displays and offers three visualization modes:
 *   - Temperature (°C) with fixed scientific Celsius colormap
 *   - Precipitation (mm/h) with meteorological continuous scale
 *   - Clouds (%) with observable cloud opacity ramp
 *
 * Note: Wind surface is separate (gfsWindCanvasAnimator) with its own
 * colormap and particle animation.
 */

export type ColorStop = {
  value: number;
  rgb: [number, number, number];
  alpha: number;
};

// Stable Celsius meteorological palette: deep violet/blue cold → cyan → soft
// green → yellow → orange → red → burgundy hot. Fixed stops (no viewport
// renormalisation) so a given temperature always renders the same colour
// anywhere on Earth and across forecast frames.
const TEMPERATURE_COLORMAP: ColorStop[] = [
  { value: -50, rgb: [70, 30, 120], alpha: 255 },
  { value: -40, rgb: [80, 60, 160], alpha: 255 },
  { value: -30, rgb: [80, 100, 200], alpha: 255 },
  { value: -20, rgb: [80, 150, 220], alpha: 255 },
  { value: -10, rgb: [90, 200, 220], alpha: 255 },
  { value: 0, rgb: [120, 220, 200], alpha: 255 },
  { value: 10, rgb: [170, 225, 140], alpha: 255 },
  { value: 20, rgb: [235, 220, 100], alpha: 255 },
  { value: 30, rgb: [240, 160, 70], alpha: 255 },
  { value: 40, rgb: [220, 80, 60], alpha: 255 },
  { value: 50, rgb: [150, 30, 50], alpha: 255 },
];

const PRECIPITATION_COLORMAP: ColorStop[] = [
  { value: 0, rgb: [222, 235, 247], alpha: 0 },
  { value: 0.1, rgb: [222, 235, 247], alpha: 120 },
  { value: 0.5, rgb: [158, 202, 225], alpha: 170 },
  { value: 1, rgb: [99, 159, 205], alpha: 210 },
  { value: 2.5, rgb: [50, 117, 178], alpha: 235 },
  { value: 5, rgb: [8, 81, 156], alpha: 245 },
  { value: 10, rgb: [3, 19, 92], alpha: 255 },
];

// Mean sea-level pressure (hPa). Meteorological convention: deep low
// (cyclonic) magenta/purple → blue → green/yellow around standard sea-level
// pressure (1013.25 hPa) → orange/red for a strong high. Fixed stops so a
// given pressure always renders the same colour across frames.
const PRESSURE_COLORMAP: ColorStop[] = [
  { value: 960, rgb: [120, 40, 150], alpha: 200 },
  { value: 980, rgb: [80, 70, 200], alpha: 190 },
  { value: 996, rgb: [60, 130, 210], alpha: 180 },
  { value: 1008, rgb: [90, 180, 170], alpha: 165 },
  { value: 1013.25, rgb: [190, 210, 130], alpha: 150 },
  { value: 1020, rgb: [235, 195, 90], alpha: 165 },
  { value: 1030, rgb: [230, 130, 60], alpha: 185 },
  { value: 1045, rgb: [190, 60, 60], alpha: 205 },
];

const CLOUD_COLORMAP: ColorStop[] = [
  { value: 0, rgb: [255, 255, 255], alpha: 0 },
  { value: 10, rgb: [245, 247, 250], alpha: 28 },
  { value: 40, rgb: [220, 224, 232], alpha: 110 },
  { value: 70, rgb: [180, 186, 200], alpha: 165 },
  { value: 100, rgb: [120, 126, 142], alpha: 215 },
];

// Wind-speed surface (m/s), rendered underneath the animated particle canvas.
// calm → deep blue/violet, light → blue, moderate → cyan/green, strong →
// yellow, very strong → orange, severe → red, extreme → purple.
const WIND_SPEED_COLORMAP: ColorStop[] = [
  { value: 0, rgb: [45, 55, 130], alpha: 60 },
  { value: 2, rgb: [40, 90, 170], alpha: 90 },
  { value: 5, rgb: [30, 140, 190], alpha: 130 },
  { value: 8, rgb: [40, 175, 165], alpha: 160 },
  { value: 11, rgb: [110, 195, 110], alpha: 175 },
  { value: 14, rgb: [200, 205, 70], alpha: 185 },
  { value: 17, rgb: [235, 165, 55], alpha: 195 },
  { value: 21, rgb: [225, 95, 55], alpha: 205 },
  { value: 25, rgb: [190, 40, 70], alpha: 215 },
  { value: 30, rgb: [140, 30, 140], alpha: 225 },
];

/** Bilinear-interpolated RGBA lookup into a fixed colormap - shared with the
 * AQI grid canvas renderer (see aqiGridCanvas.ts). */
export function sampleColormap(
  stops: ColorStop[],
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
  variable: "temperature" | "precipitation" | "clouds" | "wind" | "pressure"
): ColorStop[] {
  if (variable === "temperature") return TEMPERATURE_COLORMAP;
  if (variable === "precipitation") return PRECIPITATION_COLORMAP;
  if (variable === "wind") return WIND_SPEED_COLORMAP;
  if (variable === "pressure") return PRESSURE_COLORMAP;
  return CLOUD_COLORMAP;
}

export interface FieldLegendStop {
  value: number;
  color: string;
  alpha: number;
}

export function fieldLegendStops(
  variable: "temperature" | "precipitation" | "clouds" | "wind" | "pressure"
): FieldLegendStop[] {
  return colormapForVariable(variable).map((s) => ({
    value: s.value,
    alpha: s.alpha,
    color: `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]})`,
  }));
}

export function fieldUnit(variable: "temperature" | "precipitation" | "clouds" | "wind" | "pressure"): string {
  if (variable === "temperature") return "°C";
  if (variable === "precipitation") return "mm/h";
  if (variable === "wind") return "m/s";
  if (variable === "pressure") return "hPa";
  return "%";
}

/**
 * In-place separable box blur on a single-channel buffer, O(width*height)
 * per pass regardless of radius (sliding-window sum, not a naive O(r) inner
 * loop). Edge pixels are clamped (not zero-padded) so map edges don't darken.
 */
function boxBlur1Channel(src: Float32Array, width: number, height: number, radius: number): void {
  if (radius <= 0) return;
  const windowSize = radius * 2 + 1;
  const tmp = new Float32Array(src.length);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += src[row + Math.min(width - 1, Math.max(0, x))]!;
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / windowSize;
      sum += src[row + Math.min(width - 1, x + radius + 1)]! - src[row + Math.min(width - 1, Math.max(0, x - radius))]!;
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x]!;
    }
    for (let y = 0; y < height; y++) {
      src[y * width + x] = sum / windowSize;
      sum +=
        tmp[Math.min(height - 1, y + radius + 1) * width + x]! -
        tmp[Math.min(height - 1, Math.max(0, y - radius)) * width + x]!;
    }
  }
}

/**
 * Softens the hard per-cell edges a directly-colormapped 0.25° grid produces
 * (each of the 1440×721 pixels gets one flat colour with no blending between
 * neighbouring cells) into smooth, satellite/radar-like gradients. Blurs in
 * premultiplied-alpha space (un-premultiplying after) so transparent regions
 * don't bleed stray colour into visible ones. Two box-blur passes at a small
 * radius approximate a Gaussian well (Central Limit Theorem) while staying
 * O(width*height) - fast enough to re-run on every frame swap.
 */
function smoothImageData(img: ImageData, radius = 1, passes = 1): void {
  if (radius <= 0 || passes <= 0) return;
  const { width, height, data } = img;
  const n = width * height;
  const pr = new Float32Array(n);
  const pg = new Float32Array(n);
  const pb = new Float32Array(n);
  const pa = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3]! / 255;
    pr[i] = data[o]! * a;
    pg[i] = data[o + 1]! * a;
    pb[i] = data[o + 2]! * a;
    pa[i] = data[o + 3]!;
  }

  for (let p = 0; p < passes; p++) {
    boxBlur1Channel(pr, width, height, radius);
    boxBlur1Channel(pg, width, height, radius);
    boxBlur1Channel(pb, width, height, radius);
    boxBlur1Channel(pa, width, height, radius);
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const alpha255 = pa[i]!;
    if (alpha255 <= 1) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0;
      continue;
    }
    const a = alpha255 / 255;
    data[o] = Math.min(255, Math.max(0, Math.round(pr[i]! / a)));
    data[o + 1] = Math.min(255, Math.max(0, Math.round(pg[i]! / a)));
    data[o + 2] = Math.min(255, Math.max(0, Math.round(pb[i]! / a)));
    data[o + 3] = Math.min(255, Math.max(0, Math.round(alpha255)));
  }
}

/**
 * Render a GFS scalar field frame into a MapLibre-compatible raster image
 * source.  The function paints the GFS grid (at native 0.25° resolution) onto a
 * canvas and returns the data-URL plus the 4 corner coordinates MapLibre needs
 * for its `image` source type.
 *
 * Because the grid itself is rendered into a static image, zooming and panning
 * are handled entirely by MapLibre's WebGL raster layer — no per-pixel
 * `unproject()` calls, no JavaScript re-rendering on viewport change.  This gives
 * the same smooth zoom/pan behaviour as a tile layer.
 *
 * The image is kept at native GFS resolution (1440×721 for the whole globe)
 * to avoid exceeding data-URL size limits - upsampling that would multiply
 * the pixel count well beyond what a data URL should carry. Instead,
 * `smoothImageData` blurs the already-colormapped pixels in place (same
 * dimensions, so no size cost) to turn the blocky per-cell colouring into
 * smooth gradients. MapLibre's `raster-resampling: "linear"` paint property
 * then handles the additional bilinear interpolation when the map is zoomed.
 */
export function renderFieldToImageSource(
  frame: {
    width: number;
    height: number;
    dx: number;
    dy: number;
    bounds: { west: number; south: number; east: number; north: number };
    values: number[];
    variable: "temperature" | "precipitation" | "clouds" | "wind" | "pressure";
  }
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
    img.data[o + 3] = a;
  }
  // Pressure skips this pass entirely: isobar contours (drawn from the same
  // raw grid, see pressureIsobars.ts) are its clarity mechanism, and they
  // need to visually agree with the raster - blurring one but not the other
  // would make contour lines look misaligned with the colour field.
  if (variable !== "pressure") {
    smoothImageData(img);
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

/** Wind-speed magnitude (m/s) at every grid cell, from a GFS U/V wind frame. */
export function windSpeedValues(u: number[], v: number[]): number[] {
  const out = new Array<number>(u.length);
  for (let i = 0; i < u.length; i++) {
    const uc = u[i] ?? 0;
    const vc = v[i] ?? 0;
    out[i] = Math.sqrt(uc * uc + vc * vc);
  }
  return out;
}