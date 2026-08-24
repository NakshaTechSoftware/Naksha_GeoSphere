/**
 * Mean sea-level pressure isobars, derived mathematically from the same raw
 * NOAA GFS 0.25° PRMSL grid the pressure raster is colored from (see
 * gfsFieldRenderer.ts / api-client.ts's fetchGfsWeatherFieldFrame("pressure")).
 *
 * Marching squares (https://en.wikipedia.org/wiki/Marching_squares): for
 * every grid cell, linearly interpolate where the contour level crosses each
 * of the cell's 4 edges, emit those crossings as a line segment, then stitch
 * segments that share an exact endpoint (adjacent cells compute the same
 * interpolated point along their shared edge) into longer polylines so each
 * isobar gets one label instead of one per grid cell.
 *
 * This produces contour lines - a standard, honest visualization technique -
 * not fabricated detail: every line traces values that already exist in the
 * real model grid, just linearly interpolated between real neighbouring
 * samples (the same kind of interpolation the raster's bilinear GPU
 * resampling already does, just drawn as a line instead of a colour blend).
 */

export interface IsobarLine {
  level: number; // hPa
  coordinates: [number, number][]; // [lon, lat]
}

export interface PressureExtremum {
  type: "H" | "L";
  lon: number;
  lat: number;
  valueHpa: number;
}

interface PressureGrid {
  width: number;
  height: number;
  /** South->north, west->east row-major, matching the backend's GfsWeatherFieldFrameResponse. */
  values: number[];
  longitudes: number[];
  latitudes: number[];
}

type Segment = [[number, number], [number, number]];

function cellValue(values: number[], width: number, x: number, y: number): number {
  const v = values[y * width + x];
  return v == null ? NaN : v;
}

function lerpT(v0: number, v1: number, level: number): number {
  if (v1 === v0) return 0.5;
  return (level - v0) / (v1 - v0);
}

/** Marching squares for one contour level. Returns unconnected 2-point segments. */
function marchingSquaresSegments(grid: PressureGrid, level: number): Segment[] {
  const { values, width, height, longitudes, latitudes } = grid;
  const segments: Segment[] = [];

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const v00 = cellValue(values, width, x, y); // bottom-left
      const v10 = cellValue(values, width, x + 1, y); // bottom-right
      const v11 = cellValue(values, width, x + 1, y + 1); // top-right
      const v01 = cellValue(values, width, x, y + 1); // top-left
      if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v11) || Number.isNaN(v01)) continue;

      let caseIndex = 0;
      if (v00 > level) caseIndex |= 1;
      if (v10 > level) caseIndex |= 2;
      if (v11 > level) caseIndex |= 4;
      if (v01 > level) caseIndex |= 8;
      if (caseIndex === 0 || caseIndex === 15) continue;

      const lon0 = longitudes[x]!;
      const lon1 = longitudes[x + 1]!;
      const lat0 = latitudes[y]!;
      const lat1 = latitudes[y + 1]!;

      const bottom = (): [number, number] => [lon0 + (lon1 - lon0) * lerpT(v00, v10, level), lat0];
      const top = (): [number, number] => [lon0 + (lon1 - lon0) * lerpT(v01, v11, level), lat1];
      const left = (): [number, number] => [lon0, lat0 + (lat1 - lat0) * lerpT(v00, v01, level)];
      const right = (): [number, number] => [lon1, lat0 + (lat1 - lat0) * lerpT(v10, v11, level)];

      switch (caseIndex) {
        case 1:
        case 14:
          segments.push([left(), bottom()]);
          break;
        case 2:
        case 13:
          segments.push([bottom(), right()]);
          break;
        case 3:
        case 12:
          segments.push([left(), right()]);
          break;
        case 4:
        case 11:
          segments.push([right(), top()]);
          break;
        case 6:
        case 9:
          segments.push([bottom(), top()]);
          break;
        case 7:
        case 8:
          segments.push([left(), top()]);
          break;
        case 5: {
          // Saddle: BL and TR above `level`, TL and BR below. Resolve via the
          // cell-center average - the same disambiguation every marching
          // squares implementation uses (never an arbitrary/decorative choice).
          const center = (v00 + v10 + v11 + v01) / 4;
          if (center > level) {
            segments.push([left(), top()]);
            segments.push([bottom(), right()]);
          } else {
            segments.push([left(), bottom()]);
            segments.push([top(), right()]);
          }
          break;
        }
        case 10: {
          const center = (v00 + v10 + v11 + v01) / 4;
          if (center > level) {
            segments.push([left(), bottom()]);
            segments.push([top(), right()]);
          } else {
            segments.push([left(), top()]);
            segments.push([bottom(), right()]);
          }
          break;
        }
      }
    }
  }
  return segments;
}

function pointKey(p: [number, number]): string {
  // Coordinates come from identical floating-point interpolation on both
  // sides of a shared grid edge, so an exact (rounded for FP safety) key
  // reliably matches segment endpoints that belong to the same contour.
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
}

/** Chains 2-point segments sharing an endpoint into longer polylines. */
function stitchSegments(segments: Segment[]): [number, number][][] {
  const byEndpoint = new Map<string, number[]>();
  const used = new Array(segments.length).fill(false);

  segments.forEach((seg, i) => {
    for (const p of [seg[0], seg[1]]) {
      const key = pointKey(p);
      const list = byEndpoint.get(key);
      if (list) list.push(i);
      else byEndpoint.set(key, [i]);
    }
  });

  const polylines: [number, number][][] = [];

  const extend = (line: [number, number][], fromEnd: boolean) => {
    let extended = true;
    while (extended) {
      extended = false;
      const tip = fromEnd ? line[line.length - 1]! : line[0]!;
      const candidates = byEndpoint.get(pointKey(tip)) ?? [];
      for (const idx of candidates) {
        if (used[idx]) continue;
        const [a, b] = segments[idx]!;
        const aMatches = pointKey(a) === pointKey(tip);
        const next = aMatches ? b : a;
        used[idx] = true;
        if (fromEnd) line.push(next);
        else line.unshift(next);
        extended = true;
        break;
      }
    }
  };

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const [a, b] = segments[i]!;
    const line: [number, number][] = [a, b];
    extend(line, true);
    extend(line, false);
    polylines.push(line);
  }

  return polylines;
}

/**
 * Crops a global grid to a lon/lat window before contouring. Isobars are
 * only ever shown over the India-focused viewport this app renders, and
 * marching squares over the full 1440x721 global GFS grid at ~25 levels
 * would be tens of millions of cell evaluations per frame - real, visible
 * jank for no visual benefit. Cropping first (not computing globally and
 * discarding) is what keeps this fast without reducing the data itself.
 */
export function cropGrid(
  grid: PressureGrid,
  bounds: { west: number; south: number; east: number; north: number }
): PressureGrid {
  const { width, values, longitudes, latitudes } = grid;

  let x0 = longitudes.findIndex((lon) => lon >= bounds.west);
  if (x0 < 0) x0 = 0;
  let x1 = longitudes.length - 1;
  while (x1 > x0 && longitudes[x1]! > bounds.east) x1--;

  let y0 = latitudes.findIndex((lat) => lat >= bounds.south);
  if (y0 < 0) y0 = 0;
  let y1 = latitudes.length - 1;
  while (y1 > y0 && latitudes[y1]! > bounds.north) y1--;

  const croppedWidth = Math.max(2, x1 - x0 + 1);
  const croppedHeight = Math.max(2, y1 - y0 + 1);
  const croppedValues = new Array<number>(croppedWidth * croppedHeight);

  for (let y = 0; y < croppedHeight; y++) {
    for (let x = 0; x < croppedWidth; x++) {
      croppedValues[y * croppedWidth + x] = values[(y0 + y) * width + (x0 + x)] ?? NaN;
    }
  }

  return {
    width: croppedWidth,
    height: croppedHeight,
    values: croppedValues,
    longitudes: longitudes.slice(x0, x0 + croppedWidth),
    latitudes: latitudes.slice(y0, y0 + croppedHeight),
  };
}

/** Rounds to the nearest multiple of `interval` at or below `value`. */
function floorToInterval(value: number, interval: number): number {
  return Math.floor(value / interval) * interval;
}

/**
 * Generates isobars for a pressure grid at a fixed hPa interval, spanning
 * the grid's actual min/max - never a fixed, possibly-irrelevant global
 * range. Skips near-degenerate polylines (fewer than 2 points).
 */
export function computeIsobars(
  grid: PressureGrid,
  intervalHpa = 4
): IsobarLine[] {
  // Plain loop, not Math.min(...finite)/Math.max(...finite): spreading a
  // cropped-but-still-tens-of-thousands-element grid as call arguments blows
  // the JS engine's call stack (RangeError: Maximum call stack size exceeded).
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  const lines: IsobarLine[] = [];
  for (
    let level = floorToInterval(min, intervalHpa) + intervalHpa;
    level < max;
    level += intervalHpa
  ) {
    const segments = marchingSquaresSegments(grid, level);
    if (segments.length === 0) continue;
    for (const polyline of stitchSegments(segments)) {
      if (polyline.length >= 2) {
        lines.push({ level: Math.round(level), coordinates: polyline });
      }
    }
  }
  return lines;
}

/**
 * Finds local pressure extrema (H/L centers) via a sliding-window search -
 * a cell is a candidate center only if it's the min/max within `windowCells`
 * grid cells in every direction, keeping only the strongest few so the map
 * isn't cluttered with noise. Purely mathematical - never manually placed.
 */
export function findPressureExtrema(
  grid: PressureGrid,
  windowCells = 8,
  maxPerType = 6
): PressureExtremum[] {
  const { values, width, height, longitudes, latitudes } = grid;
  const highs: { x: number; y: number; v: number }[] = [];
  const lows: { x: number; y: number; v: number }[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = cellValue(values, width, x, y);
      if (Number.isNaN(v)) continue;

      let isMax = true;
      let isMin = true;
      for (let dy = -windowCells; dy <= windowCells && (isMax || isMin); dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -windowCells; dx <= windowCells; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nv = cellValue(values, width, nx, ny);
          if (Number.isNaN(nv)) continue;
          if (nv > v) isMax = false;
          if (nv < v) isMin = false;
        }
        if (!isMax && !isMin) break;
      }
      if (isMax) highs.push({ x, y, v });
      if (isMin) lows.push({ x, y, v });
    }
  }

  const toExtrema = (
    points: { x: number; y: number; v: number }[],
    type: "H" | "L"
  ): PressureExtremum[] =>
    points
      .sort((a, b) => (type === "H" ? b.v - a.v : a.v - b.v))
      .slice(0, maxPerType)
      .map((p) => ({
        type,
        lon: longitudes[p.x]!,
        lat: latitudes[p.y]!,
        valueHpa: Math.round(p.v),
      }));

  return [...toExtrema(highs, "H"), ...toExtrema(lows, "L")];
}
