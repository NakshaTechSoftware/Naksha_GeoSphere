import type { WorkflowStage } from "./workflowStages";

/** Stage boundaries in seconds, matching the approved cinematic timing (full loop ~22.5s + reset pause). */
export const STAGE_TIMES: Record<WorkflowStage, { start: number; end: number }> = {
  INITIALIZE: { start: 0, end: 0 },
  MAP_BUILD: { start: 0, end: 1.8 },
  SEARCH: { start: 1.8, end: 3.0 },
  CAMERA_FLY: { start: 3.0, end: 5.5 },
  AOI_DRAW: { start: 5.5, end: 8.5 },
  DATA_DISCOVERY: { start: 8.5, end: 10.5 },
  DATA_SELECTION: { start: 10.5, end: 12.3 },
  ADD_TO_CART: { start: 12.3, end: 13.8 },
  SECURE_PROCESSING: { start: 13.8, end: 16.4 },
  PURCHASE_COMPLETE: { start: 16.4, end: 18.0 },
  DOWNLOAD_READY: { start: 18.0, end: 20.5 },
  RESET: { start: 20.5, end: 22.5 },
};

export const RESET_PAUSE_SECONDS = 0.7;

export const TOTAL_TIMELINE_SECONDS = STAGE_TIMES.RESET.end;

/** ?testMode=true divides every duration by this factor for fast, deterministic tests. */
export const TEST_MODE_SPEED_MULTIPLIER = 12;
