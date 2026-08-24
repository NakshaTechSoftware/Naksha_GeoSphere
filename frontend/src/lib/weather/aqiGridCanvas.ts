/**
 * High-DPI canvas renderer for the modeled air-quality grid surface (Air
 * Quality weather-map mode). Samples the ~1° gridded AQ data through the map
 * projection per pixel (same WebMercator sampling pattern as the GFS scalar
 * field renderer - see gfsFieldRenderer.ts), coloring each pixel by the US
 * AQI colormap. Kept as its own module (rather than a MapLibre raster
 * source/layer) because the AQI grid is sparse (~1° spacing) and needs
 * per-pixel bilinear resampling, not tile-based rendering.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import type { AqiGridResponse } from "@/types/environment";
import { sampleColormap, type ColorStop } from "./gfsFieldRenderer";

const AQI_COLORMAP: ColorStop[] = [
  { value: 0, rgb: [0, 168, 190], alpha: 0 }, // transparent for missing
  { value: 0, rgb: [0, 168, 190], alpha: 230 }, // Good — teal
  { value: 51, rgb: [140, 208, 0], alpha: 230 }, // Satisfactory — green
  { value: 101, rgb: [255, 242, 0], alpha: 240 }, // Moderate — yellow
  { value: 151, rgb: [255, 150, 0], alpha: 240 }, // Poor — orange
  { value: 201, rgb: [232, 24, 45], alpha: 250 }, // Very Poor — red
  { value: 301, rgb: [126, 0, 128], alpha: 255 }, // Severe — purple
  { value: 401, rgb: [76, 0, 93], alpha: 255 }, // Hazardous — maroon
];

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
