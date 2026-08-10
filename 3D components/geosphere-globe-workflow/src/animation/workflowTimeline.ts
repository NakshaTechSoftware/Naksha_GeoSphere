import gsap from "gsap";
import {
  WORKFLOW_STAGES,
  type WorkflowStage,
} from "./workflowStages";
import {
  STAGE_DURATIONS,
  STAGE_START_TIMES,
  TOTAL_LOOP_DURATION,
} from "./workflowDurations";
import type { WorkflowLocation } from "../data/locations";

/**
 * A stage handler receives a per-stage GSAP sub-timeline already positioned at the stage's
 * start time on the master timeline. Handlers add their tweens to `sub`; all tweens must
 * fit within the stage's duration (STAGE_DURATIONS).
 */
export interface StageCtx {
  sub: gsap.core.Timeline;
  location: WorkflowLocation;
  reducedMotion: boolean;
}

export type StageHandler = (ctx: StageCtx) => void;

export interface BuildTimelineOptions {
  /** Per-stage animation handlers (camera, UI, cursor). */
  handlers: Partial<Record<WorkflowStage, StageHandler>>;
  /** The location for this loop. */
  location: WorkflowLocation;
  reducedMotion: boolean;
  /** Fired the instant a stage begins. */
  onStageChange: (stage: WorkflowStage) => void;
  /** Fired when the full loop (including RESET) finishes. */
  onLoopComplete: () => void;
  /** Optional continuous tick with (timeSeconds, progress01). */
  onTick?: (time: number, progress: number) => void;
}

/**
 * Builds ONE deterministic paused timeline for a single loop. The timeline is rebuilt per
 * loop (cheap) so the next location's targets are baked in; the map/WebGL/UI are never
 * re-initialized.
 */
export function buildWorkflowTimeline(opts: BuildTimelineOptions): gsap.core.Timeline {
  const { handlers, location, reducedMotion, onStageChange, onLoopComplete, onTick } = opts;

  const tl = gsap.timeline({
    paused: true,
    repeat: 0,
    onComplete: onLoopComplete,
  });

  // A probe tween spanning the whole loop drives continuous ticks without layout work.
  const probe = { t: 0 };
  tl.to(probe, {
    t: TOTAL_LOOP_DURATION,
    duration: TOTAL_LOOP_DURATION,
    ease: "none",
    onUpdate: () => {
      if (onTick) onTick(probe.t, tl.progress());
    },
  }, 0);

  for (const stage of WORKFLOW_STAGES) {
    const duration = STAGE_DURATIONS[stage];
    const start = STAGE_START_TIMES[stage];
    const sub = gsap.timeline();
    sub.eventCallback("onStart", () => onStageChange(stage));
    const handler = handlers[stage];
    if (handler) handler({ sub, location, reducedMotion });
    // Cap the sub at the stage duration so an overlong handler can never shift later stages.
    if (sub.duration() > duration) {
      console.warn(`[workflow] stage ${stage} handler exceeds its ${duration}s budget`);
    }
    tl.add(sub, start);
  }

  return tl;
}

export { TOTAL_LOOP_DURATION };
