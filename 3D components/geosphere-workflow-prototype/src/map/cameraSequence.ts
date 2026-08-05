import type { Map as MapLibreMap } from "maplibre-gl";
import { BENGALURU_CLOSE_VIEW, BENGALURU_RESET_VIEW, BENGALURU_WIDE_VIEW } from "@/data/mockWorkflow";

export type CameraView = {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

/** Sets the map instantly, no animation — used for INITIALIZE/MAP_BUILD. */
export function setInitialCamera(map: MapLibreMap): void {
  map.jumpTo(BENGALURU_WIDE_VIEW);
}

/**
 * The CAMERA_FLY stage: a single smooth premium flight into Bengaluru.
 * Duration is driven by the caller so it stays in lockstep with the GSAP
 * master timeline rather than MapLibre's own easing clock.
 */
export function flyToBengaluru(map: MapLibreMap, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    map.once("moveend", () => resolve());
    map.flyTo({
      ...BENGALURU_CLOSE_VIEW,
      duration: durationMs,
      curve: 1.28,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      essential: true,
    });
  });
}

/** Reduced-motion variant: a short crossfade-friendly jump, no long flight. */
export function softCrossfadeToBengaluru(map: MapLibreMap): void {
  map.easeTo({ ...BENGALURU_CLOSE_VIEW, duration: 250 });
}

export function easeOutForReset(map: MapLibreMap, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    map.once("moveend", () => resolve());
    map.easeTo({ ...BENGALURU_RESET_VIEW, duration: durationMs, easing: (t) => t });
  });
}
