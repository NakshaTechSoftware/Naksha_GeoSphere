// The single authoritative stage list. One state machine drives the whole loop.

export const WORKFLOW_STAGES = [
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
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const STAGE_ORDER: Record<WorkflowStage, number> = WORKFLOW_STAGES.reduce(
  (acc, stage, i) => {
    acc[stage] = i;
    return acc;
  },
  {} as Record<WorkflowStage, number>
);

export const FIRST_STAGE: WorkflowStage = "BOOT";
export const LAST_STAGE: WorkflowStage = "RESET";

/** Compact map-facing stage group (used for testable state logic). */
export const STAGE_GROUP: Record<WorkflowStage, string> = {
  BOOT: "boot",
  GLOBE_INTRO: "globe",
  ROTATE_TO_INDIA: "india",
  INDIA_FOCUS: "india",
  KARNATAKA_FOCUS: "karnataka",
  LOCAL_FLY_IN: "city",
  LOCAL_MAP_READY: "city",
  AOI_SELECTION: "aoi",
  DATA_DISCOVERY: "data",
  FORMAT_SELECTION: "data",
  EXPORT_REQUEST: "export",
  PAYMENT: "payment",
  SECURE_PROCESSING: "processing",
  EMAIL_DELIVERY: "email",
  DELIVERY_COMPLETE: "complete",
  RESET: "reset",
};
