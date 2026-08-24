import type { Map as MapLibreMap, LngLatLike, PointLike } from "maplibre-gl";

import type { GfsWindBounds, GfsWindFrameResponse } from "@/types/environment";

interface Particle {
  age: number;
  /** Screen-space position in CSS pixels (not physical pixels). */
  screenX: number;
  screenY: number;
  /** Geographic position, kept in sync with screen position for wind sampling. */
  longitude: number;
  latitude: number;
  maxAge: number;
}

interface GfsWindCanvasAnimatorOptions {
  onInvalidate?: () => void;
}

// ── Screen-space particle density configuration ──────────────────────────
//
// Particle COUNT is derived from the CSS viewport area (not the physical
// pixel area, not the geographic area, not the tile count).  This keeps
// apparent density consistent across zoom levels and display resolutions.
//
// Target: one particle per N CSS pixels of viewport area.
const PARTICLES_PER_PX2 = 1 / 1_600; // ~1 particle per 40×40 px cell
const MIN_PARTICLES = 300;
const MAX_PARTICLES = 4_000;
const LOW_POWER_MAX_PARTICLES = 1_500;

// A particle lives for this many animation frames before being recycled.
const PARTICLE_MAX_AGE_MIN = 60;
const PARTICLE_MAX_AGE_RANGE = 80;

// Cap how far a particle can travel in screen space per frame to prevent
// huge jumps / streaks at high zoom (direction and relative speed preserved).
const MAX_SCREEN_DISPLACEMENT_PX = 8;

export class GfsWindCanvasAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private frame: GfsWindFrameResponse;
  private map: MapLibreMap | null = null;
  private previousFrame: GfsWindFrameResponse | null = null;
  private frameBlendStartedAt = 0;
  private readonly frameBlendDurationMs = 900;
  private particles: Particle[] = [];
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private density = 0.6;
  private running = false;
  private readonly onInvalidate?: () => void;
  private cssWidth: number;
  private cssHeight: number;
  private pixelRatio = 1;

  constructor(
    frame: GfsWindFrameResponse,
    options: GfsWindCanvasAnimatorOptions = {},
    canvasWidth = 560,
    canvasHeight = 760
  ) {
    this.frame = frame;
    this.onInvalidate = options.onInvalidate;
    this.canvas = document.createElement("canvas");
    this.cssWidth = Math.max(220, Math.round(canvasWidth));
    this.cssHeight = Math.max(220, Math.round(canvasHeight));
    this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssWidth * this.pixelRatio);
    this.canvas.height = Math.round(this.cssHeight * this.pixelRatio);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context is unavailable for NOAA wind canary.");
    }
    this.ctx = ctx;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "14";
    this.reseedParticles();
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

  setFrame(frame: GfsWindFrameResponse): void {
    const sameGrid =
      this.frame.width === frame.width &&
      this.frame.height === frame.height &&
      this.frame.dx === frame.dx &&
      this.frame.dy === frame.dy &&
      this.frame.bounds.west === frame.bounds.west &&
      this.frame.bounds.south === frame.bounds.south &&
      this.frame.bounds.east === frame.bounds.east &&
      this.frame.bounds.north === frame.bounds.north;

    if (sameGrid) {
      this.previousFrame = this.frame;
      this.frameBlendStartedAt = performance.now();
    } else {
      this.previousFrame = null;
      this.reseedParticles();
    }
    this.frame = frame;
  }

  setDensity(density: number): void {
    this.density = Math.max(0.1, Math.min(1, density));
    this.reseedParticles();
  }

  resize(width: number, height: number, pixelRatio = window.devicePixelRatio || 1): void {
    const nextCssWidth = Math.max(220, Math.round(width));
    const nextCssHeight = Math.max(220, Math.round(height));
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
    this.ctx.setTransform(nextPixelRatio, 0, 0, nextPixelRatio, 0, 0);
    // Re-seed only if the particle count target changed significantly.
    // On pure zoom (same CSS size) we keep existing particles.
    this.reseedParticles();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.tick = this.tick.bind(this);
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.clear();
    this.detach();
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Returns diagnostic info useful for performance testing / debugging.
   */
  getDiagnostics(): {
    cssWidth: number;
    cssHeight: number;
    pixelRatio: number;
    particleCount: number;
    targetParticleCount: number;
  } {
    return {
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      pixelRatio: this.pixelRatio,
      particleCount: this.particles.length,
      targetParticleCount: this.computeTargetParticleCount(),
    };
  }

  // ── Particle management ────────────────────────────────────────────────

  /**
   * Compute the target particle count from the CSS viewport area.
   * Uses CSS pixels (not physical pixels) so Retina displays don't get
   * 4× the particle load.
   */
  private computeTargetParticleCount(): number {
    const cssArea = this.cssWidth * this.cssHeight;
    const raw = cssArea * PARTICLES_PER_PX2 * this.density;
    const clamped = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(raw)));
    return clamped;
  }

  private reseedParticles(): void {
    const target = this.computeTargetParticleCount();
    this.particles = Array.from({ length: target }, () => this.createParticle());
    this.clear();
  }

  /**
   * Spawn a particle in SCREEN SPACE (CSS pixels), then convert to
   * geographic coordinates via the map projection.  This guarantees
   * uniform screen coverage regardless of zoom level or geographic
   * extent.
   */
  private createParticle(): Particle {
    const screenX = Math.random() * this.cssWidth;
    const screenY = Math.random() * this.cssHeight;
    const { longitude, latitude } = this.screenToGeo(screenX, screenY);
    return {
      screenX,
      screenY,
      longitude,
      latitude,
      age: 0,
      maxAge: PARTICLE_MAX_AGE_MIN + Math.floor(Math.random() * PARTICLE_MAX_AGE_RANGE),
    };
  }

  /**
   * Convert screen (CSS pixel) coordinates to geographic lon/lat.
   * Falls back to the frame bounds center if the map isn't available.
   */
  private screenToGeo(screenX: number, screenY: number): { longitude: number; latitude: number } {
    if (this.map) {
      const pt = this.map.unproject([screenX, screenY] as PointLike) as { lng: number; lat: number };
      return { longitude: pt.lng, latitude: pt.lat };
    }
    // Fallback: center of the frame bounds.
    const { bounds } = this.frame;
    return {
      longitude: (bounds.west + bounds.east) / 2,
      latitude: (bounds.south + bounds.north) / 2,
    };
  }

  /**
   * Convert geographic lon/lat to screen (CSS pixel) coordinates.
   */
  private geoToScreen(longitude: number, latitude: number): { x: number; y: number } {
    if (this.map) {
      const pt = this.map.project([longitude, latitude] as LngLatLike) as { x: number; y: number };
      return { x: pt.x, y: pt.y };
    }
    const { bounds } = this.frame;
    const x = ((longitude - bounds.west) / (bounds.east - bounds.west)) * this.cssWidth;
    const y = this.cssHeight - ((latitude - bounds.south) / (bounds.north - bounds.south)) * this.cssHeight;
    return { x, y };
  }

  // ── Animation loop ─────────────────────────────────────────────────────

  private tick(timestamp: number): void {
    if (!this.running) return;
    const dtSeconds =
      this.lastTimestamp === 0 ? 0.016 : Math.min(0.05, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    this.fadeCanvas();
    this.drawParticles(dtSeconds, this.getFrameBlendFactor(timestamp));
    this.onInvalidate?.();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  private fadeCanvas(): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = "destination-in";
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  private getFrameBlendFactor(timestamp: number): number {
    if (!this.previousFrame) return 1;
    const elapsed = timestamp - this.frameBlendStartedAt;
    const factor = Math.max(0, Math.min(1, elapsed / this.frameBlendDurationMs));
    if (factor >= 1) {
      this.previousFrame = null;
      return 1;
    }
    return factor;
  }

  private drawParticles(dtSeconds: number, frameBlendFactor: number): void {
    const visualSeconds = dtSeconds * 28_000;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index]!;
      const previousScreenX = particle.screenX;
      const previousScreenY = particle.screenY;
      const previousLon = particle.longitude;
      const previousLat = particle.latitude;

      const vector = interpolateWind(
        this.frame,
        particle.longitude,
        particle.latitude,
        this.previousFrame,
        frameBlendFactor
      );

      if (!vector) {
        // No wind data at this location — respawn in screen space.
        this.particles[index] = this.createParticle();
        continue;
      }

      // Convert U/V (m/s) to screen-space displacement.
      // We project the geographic movement to screen pixels and cap it.
      const lonDegreesPerMeter =
        1 / (111_320 * Math.max(0.2, Math.cos((particle.latitude * Math.PI) / 180)));
      const latDegreesPerMeter = 1 / 111_320;
      const newLon = particle.longitude + vector.u * visualSeconds * lonDegreesPerMeter;
      const newLat = particle.latitude + vector.v * visualSeconds * latDegreesPerMeter;

      // Project to screen space.
      const newScreen = this.geoToScreen(newLon, newLat);
      const dx = newScreen.x - previousScreenX;
      const dy = newScreen.y - previousScreenY;
      const dist = Math.hypot(dx, dy);

      // Cap maximum screen displacement per frame to prevent huge jumps
      // at high zoom while preserving direction and relative flow.
      let finalX = newScreen.x;
      let finalY = newScreen.y;
      let finalLon = newLon;
      let finalLat = newLat;

      if (dist > MAX_SCREEN_DISPLACEMENT_PX) {
        const scale = MAX_SCREEN_DISPLACEMENT_PX / dist;
        finalX = previousScreenX + dx * scale;
        finalY = previousScreenY + dy * scale;
        // Back-project the capped screen position to geographic coords
        // so the particle's lon/lat stays consistent with its screen position.
        if (this.map) {
          const geo = this.map.unproject([finalX, finalY] as PointLike) as { lng: number; lat: number };
          finalLon = geo.lng;
          finalLat = geo.lat;
        }
      }

      particle.screenX = finalX;
      particle.screenY = finalY;
      particle.longitude = finalLon;
      particle.latitude = finalLat;
      particle.age += 1;

      // Check if particle is still within the viewport (with a small margin
      // for particles near the edge that are still being drawn).
      const margin = 20;
      const inViewport =
        finalX >= -margin &&
        finalX <= this.cssWidth + margin &&
        finalY >= -margin &&
        finalY <= this.cssHeight + margin;

      if (particle.age > particle.maxAge || !inViewport) {
        // Respawn in screen space — NOT in geographic space.
        this.particles[index] = this.createParticle();
        continue;
      }

      const speed = Math.sqrt(vector.u ** 2 + vector.v ** 2);
      const alpha = Math.max(0.28, Math.min(0.85, 0.24 + speed / 16));
      const width = Math.max(1.1, Math.min(2.6, 1.1 + speed / 14));

      this.ctx.beginPath();
      this.ctx.moveTo(previousScreenX, previousScreenY);
      this.ctx.lineTo(finalX, finalY);
      this.ctx.strokeStyle = `rgba(245, 249, 255, ${alpha.toFixed(3)})`;
      this.ctx.lineWidth = width;
      this.ctx.lineCap = "round";
      this.ctx.stroke();
    }
  }
}

function interpolateWind(
  frame: GfsWindFrameResponse,
  lon: number,
  lat: number,
  previousFrame?: GfsWindFrameResponse | null,
  frameBlendFactor = 1
): { u: number; v: number } | null {
  const currentVector = sampleInterpolatedVector(frame, lon, lat);
  if (!currentVector) return null;
  if (!previousFrame || frameBlendFactor >= 1) return currentVector;

  const previousVector = sampleInterpolatedVector(previousFrame, lon, lat);
  if (!previousVector) return currentVector;

  return {
    u: previousVector.u * (1 - frameBlendFactor) + currentVector.u * frameBlendFactor,
    v: previousVector.v * (1 - frameBlendFactor) + currentVector.v * frameBlendFactor,
  };
}

/**
 * Bilinearly interpolates the U/V wind vector (m/s) at an arbitrary
 * geographic point from a GFS wind frame's grid. Exported so the wind
 * cursor inspector (Explore map) samples the exact same decoded grid the
 * particle animation renders from - never a separate data source.
 */
export function sampleInterpolatedVector(
  frame: GfsWindFrameResponse,
  lon: number,
  lat: number
): { u: number; v: number } | null {
  const { bounds, dx, dy, width, height, u, v } = frame;

  let x = (lon - bounds.west) / dx;
  const y = (lat - bounds.south) / dy;

  // Latitude out of bounds — no data.
  if (y < 0 || y >= height - 1) return null;

  // Longitude wrapping for the antimeridian: the global GFS grid is
  // continuous in longitude, so wrap x into [0, width) to sample across
  // the seam (e.g. lon=181° wraps to x≈0).
  const gridSpan = width * dx;
  if (x < 0) x += gridSpan / dx;
  if (x >= width) x -= gridSpan / dx;

  // After wrapping, x is in [0, width).  For bilinear interpolation we
  // need x and x+1, so if x+1 would exceed the grid, wrap x1 as well.
  const x0Raw = Math.floor(x);
  const x1Raw = x0Raw + 1;
  const x0 = ((x0Raw % width) + width) % width;
  const x1 = ((x1Raw % width) + width) % width;
  const y0 = Math.floor(y);
  const y1 = y0 + 1;
  const tx = x - x0Raw;
  const ty = y - y0;

  const q11 = sampleGrid(u, width, x0, y0);
  const q21 = sampleGrid(u, width, x1, y0);
  const q12 = sampleGrid(u, width, x0, y1);
  const q22 = sampleGrid(u, width, x1, y1);

  const r11 = sampleGrid(v, width, x0, y0);
  const r21 = sampleGrid(v, width, x1, y0);
  const r12 = sampleGrid(v, width, x0, y1);
  const r22 = sampleGrid(v, width, x1, y1);

  return {
    u: bilinear(q11, q21, q12, q22, tx, ty),
    v: bilinear(r11, r21, r12, r22, tx, ty),
  };
}

function sampleGrid(values: number[], width: number, x: number, y: number): number {
  return values[y * width + x] ?? 0;
}

function bilinear(
  q11: number,
  q21: number,
  q12: number,
  q22: number,
  tx: number,
  ty: number
): number {
  const a = q11 * (1 - tx) + q21 * tx;
  const b = q12 * (1 - tx) + q22 * tx;
  return a * (1 - ty) + b * ty;
}
