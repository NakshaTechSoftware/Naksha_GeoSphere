import type { Map as MapLibreMap } from "maplibre-gl";
import type { WorkflowLocation } from "../data/locations";

export interface CameraTarget {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  /** Optional animation duration (ms) when called outside the GSAP timeline. */
  duration?: number;
  /**
   * Optional screen-space pixel offset of the target center relative to the map's
   * center. Positive y pushes the area of interest DOWN the viewport - used for the
   * AOI stage so the polygon draws below the floating "Drawing AOI" toolbar.
   */
  offset?: [number, number];
}

/** Full-continent opening view: the whole sphere with Europe/Africa/Asia in frame. */
export const GLOBE_START: CameraTarget = {
  center: [8, 20],
  zoom: 0.9,
  pitch: 0,
  bearing: 0,
};

/** Slow premium spin target reached during GLOBE_INTRO (globe rotates eastward). */
export const GLOBE_SPIN_TARGET: CameraTarget = {
  center: [38, 18],
  zoom: 0.95,
  pitch: 0,
  bearing: 0,
};

export const INDIA_TARGET: CameraTarget = {
  center: [79.5, 22.5],
  zoom: 2.6,
  pitch: 10,
  bearing: 0,
};

export const KARNATAKA_TARGET: CameraTarget = {
  center: [76.3, 15.2],
  zoom: 4.4,
  pitch: 18,
  bearing: 4,
};

/** Local city view - a mild 3D perspective, not a racing drone. */
export function localCityTarget(loc: WorkflowLocation): CameraTarget {
  return {
    center: loc.center,
    zoom: 13.2,
    pitch: 42,
    bearing: loc.bearing,
  };
}

/** Slightly higher + straighter camera so the AOI polygon reads well.
 *  The offset pushes the AOI toward the lower half of the container, keeping it
 *  clear of the search bar and the "Drawing AOI" toolbar at the top. The offset is
 *  proportional to the container height so the polygon never escapes the rounded
 *  box at any preview size. */
export function aoiViewTarget(loc: WorkflowLocation, containerHeight = 500): CameraTarget {
  return {
    center: loc.center,
    zoom: 13.8,
    pitch: 36,
    bearing: loc.bearing,
    offset: [0, Math.round(containerHeight * 0.22)],
  };
}

/** The camera methods are driven by the GSAP master timeline via these small wrappers. */
export function easeTo(map: MapLibreMap, target: CameraTarget, durationMs: number): void {
  map.easeTo({
    center: target.center,
    zoom: target.zoom,
    pitch: target.pitch,
    bearing: target.bearing,
    duration: durationMs,
    essential: true,
    ...(target.offset ? { offset: target.offset } : {}),
  });
}

export function flyTo(map: MapLibreMap, target: CameraTarget, durationMs: number): void {
  map.flyTo({
    center: target.center,
    zoom: target.zoom,
    pitch: target.pitch,
    bearing: target.bearing,
    duration: durationMs,
    essential: true,
    ...(target.offset ? { offset: target.offset } : {}),
  });
}

/** Animate camera over a duration by tweening an interpolated progress object. */
export function animateCameraTo(
  map: MapLibreMap,
  target: CameraTarget,
  onUpdate?: (p: number) => void
): gsap.TweenVars {
  return {
    duration: 1,
    ease: "power2.inOut",
    onStart: () => flyTo(map, target, 0),
    onUpdate: () => onUpdate?.(0),
  };
}
