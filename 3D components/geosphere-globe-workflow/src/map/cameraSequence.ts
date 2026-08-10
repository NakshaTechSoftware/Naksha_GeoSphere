import type { Map as MapLibreMap } from "maplibre-gl";
import type { WorkflowLocation } from "../data/locations";

export interface CameraTarget {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  /** Optional animation duration (ms) when called outside the GSAP timeline. */
  duration?: number;
}

export const GLOBE_START: CameraTarget = {
  center: [72, 20],
  zoom: 1.1,
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

/** Slightly higher + straighter camera so the AOI polygon reads well. */
export function aoiViewTarget(loc: WorkflowLocation): CameraTarget {
  return {
    center: loc.center,
    zoom: 13.8,
    pitch: 36,
    bearing: loc.bearing,
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
