/**
 * The complete finite-state workflow. Order here is the single source of
 * truth for stage sequencing — the GSAP master timeline places its labels
 * in exactly this order and nothing advances the UI outside of it.
 */
export const WORKFLOW_STAGES = [
  "INITIALIZE",
  "MAP_BUILD",
  "SEARCH",
  "CAMERA_FLY",
  "AOI_DRAW",
  "DATA_DISCOVERY",
  "DATA_SELECTION",
  "ADD_TO_CART",
  "SECURE_PROCESSING",
  "PURCHASE_COMPLETE",
  "DOWNLOAD_READY",
  "RESET",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export function stageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGES.indexOf(stage);
}

export function isStageAtOrAfter(current: WorkflowStage, target: WorkflowStage): boolean {
  return stageIndex(current) >= stageIndex(target);
}

export const FIRST_STAGE: WorkflowStage = WORKFLOW_STAGES[0];
export const LAST_STAGE: WorkflowStage = WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1];
