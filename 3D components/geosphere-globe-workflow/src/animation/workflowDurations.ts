// Recommended master timing (seconds) - total loop ≈ 32s.
import type { WorkflowStage } from "./workflowStages";

export const STAGE_DURATIONS: Record<WorkflowStage, number> = {
  BOOT: 0.4,
  GLOBE_INTRO: 2.1, // 0.0 - 2.5
  ROTATE_TO_INDIA: 2.5, // 2.5 - 5.0
  INDIA_FOCUS: 1.8, // 5.0 - 6.8
  KARNATAKA_FOCUS: 1.5, // 6.8 - 8.3
  LOCAL_FLY_IN: 2.7, // 8.8 - 11.5
  LOCAL_MAP_READY: 1.0, // 11.5 - 12.5 (interface assemble)
  AOI_SELECTION: 3.2, // 12.5 - 15.7
  DATA_DISCOVERY: 1.6, // 15.7 - 17.3
  FORMAT_SELECTION: 1.8, // 17.3 - 19.1
  EXPORT_REQUEST: 1.4, // 19.1 - 20.5
  PAYMENT: 2.6, // 20.5 - 23.1
  SECURE_PROCESSING: 2.9, // 23.1 - 26.0
  EMAIL_DELIVERY: 2.5, // 26.0 - 28.5
  DELIVERY_COMPLETE: 1.5, // 28.5 - 30.0
  RESET: 2.0, // 30.0 - 32.0
};

/** Total duration of one full loop in seconds. */
export const TOTAL_LOOP_DURATION: number = Object.values(STAGE_DURATIONS).reduce(
  (a, b) => a + b,
  0
);

/** Starting time (s) of each stage within the master loop. */
export const STAGE_START_TIMES: Record<WorkflowStage, number> = (() => {
  const out = {} as Record<WorkflowStage, number>;
  let t = 0;
  for (const stage of [
    "BOOT",
    "GLOBE_INTRO",
    "ROTATE_TO_INDIA",
    "INDIA_FOCUS",
    "KARNATAKA_FOCUS",
    "LOCAL_FLY_IN",
    "LOCAL_MAP_READY",
    "AOI_SELECTION",
    "DATA_DISCOVERY",
    "FORMAT_SELECTION",
    "EXPORT_REQUEST",
    "PAYMENT",
    "SECURE_PROCESSING",
    "EMAIL_DELIVERY",
    "DELIVERY_COMPLETE",
    "RESET",
  ] as const) {
    out[stage] = t;
    t += STAGE_DURATIONS[stage];
  }
  return out;
})();
