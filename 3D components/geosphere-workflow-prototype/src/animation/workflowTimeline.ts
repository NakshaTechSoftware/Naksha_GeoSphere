import gsap from "gsap";
import { WORKFLOW_STAGES, type WorkflowStage } from "./workflowStages";
import {
  RESET_PAUSE_SECONDS,
  STAGE_TIMES,
  TEST_MODE_SPEED_MULTIPLIER,
} from "./workflowDurations";
import { DEMO_SEARCH_QUERY } from "@/data/mockWorkflow";
import { DEFAULT_SELECTED_DATASET_IDS } from "@/data/mockDatasets";

export type CursorPoint = { xPct: number; yPct: number };

/**
 * Every visual side-effect the timeline drives, expressed as plain
 * callbacks. Components subscribe via useWorkflowTimeline and turn these
 * into React state — the timeline itself never touches the DOM directly
 * (except the cursor's normalized position, which is intentionally cheap
 * data, not an element reference).
 */
export type WorkflowTimelineHandlers = {
  onStageEnter?: (stage: WorkflowStage) => void;
  onCursorMove?: (point: CursorPoint) => void;
  onCursorClick?: () => void;
  onTypedTextChange?: (text: string) => void;
  onAoiVertexCount?: (count: number) => void;
  onAoiFillVisible?: (visible: boolean) => void;
  onAoiAreaProgress?: (progress: number) => void;
  onDatasetSelected?: (datasetId: string, selected: boolean) => void;
  onCartBadge?: (count: number) => void;
  onCartButtonLabel?: (label: "Add to Cart" | "Added to Cart" | "Proceed Securely") => void;
  onSecureStageIndex?: (index: number) => void;
  onDownloadClicked?: () => void;
  onLoopComplete?: () => void;
};

export type WorkflowTimelineOptions = {
  reducedMotion: boolean;
  testMode: boolean;
  loop: boolean;
  playbackRate: number;
};

const CURSOR_POSITIONS = {
  rest: { xPct: 50, yPct: 92 },
  searchField: { xPct: 46, yPct: 12 },
  drawButton: { xPct: 12, yPct: 24 },
  imageryCard: { xPct: 34, yPct: 90 },
  elevationCard: { xPct: 46, yPct: 90 },
  addToCart: { xPct: 82, yPct: 58 },
  downloadButton: { xPct: 82, yPct: 70 },
} as const;

function cursorTo(
  timeline: gsap.core.Timeline,
  proxy: CursorPoint,
  target: CursorPoint,
  handlers: WorkflowTimelineHandlers,
  atTime: number,
  duration: number,
) {
  timeline.to(
    proxy,
    {
      xPct: target.xPct,
      yPct: target.yPct,
      duration,
      ease: "power2.inOut",
      onUpdate: () => handlers.onCursorMove?.({ ...proxy }),
    },
    atTime,
  );
}

/**
 * Builds (but does not start) the single GSAP master timeline for one
 * workflow loop. Labels match STAGE_TIMES exactly. Callers control
 * play/pause/seek/reverse from the returned timeline instance.
 */
export function buildWorkflowTimeline(
  handlers: WorkflowTimelineHandlers,
  options: WorkflowTimelineOptions,
): gsap.core.Timeline {
  const speed = options.testMode ? TEST_MODE_SPEED_MULTIPLIER : 1;
  const resetPause = options.testMode ? RESET_PAUSE_SECONDS / speed : RESET_PAUSE_SECONDS;
  const t = (seconds: number) => seconds / speed;

  const timeline = gsap.timeline({
    paused: true,
    repeat: options.loop ? -1 : 0,
    repeatDelay: options.loop ? resetPause : 0,
    onRepeat: () => handlers.onLoopComplete?.(),
    onComplete: () => handlers.onLoopComplete?.(),
  });

  timeline.timeScale(options.playbackRate);

  const cursorProxy: CursorPoint = { ...CURSOR_POSITIONS.rest };
  const searchProxy = { chars: 0 };
  const aoiProxy = { vertices: 0 };
  const areaProxy = { value: 0 };

  for (const stage of WORKFLOW_STAGES) {
    const { start } = STAGE_TIMES[stage];
    timeline.addLabel(stage, t(start));
    timeline.call(() => handlers.onStageEnter?.(stage), undefined, t(start));
  }

  // --- MAP_BUILD: handled visually by components watching the stage; no
  // timeline-owned tween needed beyond the stage-enter callback above.

  // --- SEARCH: typed text + cursor to field.
  if (!options.reducedMotion) {
    cursorTo(timeline, cursorProxy, CURSOR_POSITIONS.searchField, handlers, t(STAGE_TIMES.SEARCH.start), t(0.35));
  }
  timeline.to(
    searchProxy,
    {
      chars: DEMO_SEARCH_QUERY.length,
      duration: t(0.85),
      ease: "none",
      onUpdate: () => handlers.onTypedTextChange?.(DEMO_SEARCH_QUERY.slice(0, Math.round(searchProxy.chars))),
    },
    t(STAGE_TIMES.SEARCH.start + 0.1),
  );
  timeline.call(() => handlers.onCursorClick?.(), undefined, t(STAGE_TIMES.SEARCH.end - 0.15));

  // --- CAMERA_FLY: components own the actual map.flyTo call via onStageEnter.

  // --- AOI_DRAW: cursor to draw button, then vertex-by-vertex reveal.
  if (!options.reducedMotion) {
    cursorTo(
      timeline,
      cursorProxy,
      CURSOR_POSITIONS.drawButton,
      handlers,
      t(STAGE_TIMES.AOI_DRAW.start),
      t(0.3),
    );
  }
  timeline.call(() => handlers.onCursorClick?.(), undefined, t(STAGE_TIMES.AOI_DRAW.start + 0.3));
  timeline.to(
    aoiProxy,
    {
      vertices: 7,
      duration: t(2.0),
      ease: "steps(7)",
      onUpdate: () => handlers.onAoiVertexCount?.(Math.round(aoiProxy.vertices)),
    },
    t(STAGE_TIMES.AOI_DRAW.start + 0.4),
  );
  timeline.call(() => handlers.onAoiFillVisible?.(true), undefined, t(STAGE_TIMES.AOI_DRAW.end - 0.6));
  timeline.to(
    areaProxy,
    {
      value: 1,
      duration: t(0.5),
      ease: "power1.out",
      onUpdate: () => handlers.onAoiAreaProgress?.(areaProxy.value),
    },
    t(STAGE_TIMES.AOI_DRAW.end - 0.5),
  );

  // --- DATA_DISCOVERY: panel/price population is driven by the AOI area
  // becoming available; components read the finalized area once entering
  // this stage (see useWorkflowTimeline).

  // --- DATA_SELECTION: imagery then elevation.
  timeline.call(() => handlers.onDatasetSelected?.("imagery", true), undefined, t(STAGE_TIMES.DATA_SELECTION.start + 0.1));
  if (!options.reducedMotion) {
    cursorTo(
      timeline,
      cursorProxy,
      CURSOR_POSITIONS.elevationCard,
      handlers,
      t(STAGE_TIMES.DATA_SELECTION.start + 0.3),
      t(0.4),
    );
  }
  timeline.call(() => handlers.onDatasetSelected?.("elevation", true), undefined, t(STAGE_TIMES.DATA_SELECTION.start + 0.9));

  // --- ADD_TO_CART
  if (!options.reducedMotion) {
    cursorTo(timeline, cursorProxy, CURSOR_POSITIONS.addToCart, handlers, t(STAGE_TIMES.ADD_TO_CART.start), t(0.4));
  }
  timeline.call(() => handlers.onCursorClick?.(), undefined, t(STAGE_TIMES.ADD_TO_CART.start + 0.4));
  timeline.call(() => handlers.onCartButtonLabel?.("Added to Cart"), undefined, t(STAGE_TIMES.ADD_TO_CART.start + 0.42));
  timeline.call(() => handlers.onCartBadge?.(DEFAULT_SELECTED_DATASET_IDS.length), undefined, t(STAGE_TIMES.ADD_TO_CART.start + 0.5));
  timeline.call(() => handlers.onCartButtonLabel?.("Proceed Securely"), undefined, t(STAGE_TIMES.ADD_TO_CART.end - 0.3));

  // --- SECURE_PROCESSING: 5 sequential stages across the window.
  const secureDuration = STAGE_TIMES.SECURE_PROCESSING.end - STAGE_TIMES.SECURE_PROCESSING.start;
  const secureStepCount = 5;
  for (let i = 0; i < secureStepCount; i += 1) {
    const at = STAGE_TIMES.SECURE_PROCESSING.start + (secureDuration * i) / secureStepCount;
    timeline.call(() => handlers.onSecureStageIndex?.(i), undefined, t(at));
  }

  // --- PURCHASE_COMPLETE / DOWNLOAD_READY: driven purely by stage-enter.
  if (!options.reducedMotion) {
    cursorTo(
      timeline,
      cursorProxy,
      CURSOR_POSITIONS.downloadButton,
      handlers,
      t(STAGE_TIMES.DOWNLOAD_READY.start + 0.4),
      t(0.4),
    );
  }
  timeline.call(() => handlers.onCursorClick?.(), undefined, t(STAGE_TIMES.DOWNLOAD_READY.start + 0.9));
  timeline.call(() => handlers.onDownloadClicked?.(), undefined, t(STAGE_TIMES.DOWNLOAD_READY.start + 0.95));

  // --- RESET: return every proxy + all handler-observed state to initial.
  timeline.call(
    () => {
      handlers.onAoiVertexCount?.(0);
      handlers.onAoiFillVisible?.(false);
      handlers.onAoiAreaProgress?.(0);
      handlers.onDatasetSelected?.("imagery", false);
      handlers.onDatasetSelected?.("elevation", false);
      handlers.onCartBadge?.(0);
      handlers.onCartButtonLabel?.("Add to Cart");
      handlers.onSecureStageIndex?.(-1);
      handlers.onTypedTextChange?.("");
      handlers.onAoiAreaProgress?.(0);
    },
    undefined,
    t(STAGE_TIMES.RESET.start + 0.2),
  );
  if (!options.reducedMotion) {
    cursorTo(timeline, cursorProxy, CURSOR_POSITIONS.rest, handlers, t(STAGE_TIMES.RESET.start), t(0.6));
  }
  aoiProxy.vertices = 0;
  searchProxy.chars = 0;
  areaProxy.value = 0;

  return timeline;
}
