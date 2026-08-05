import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildWorkflowTimeline, type CursorPoint } from "./workflowTimeline";
import { FIRST_STAGE, WORKFLOW_STAGES, stageIndex, type WorkflowStage } from "./workflowStages";
import { STAGE_TIMES, TEST_MODE_SPEED_MULTIPLIER } from "./workflowDurations";
import { calculateTotalPrice } from "@/data/mockDatasets";
import { buildDemoAoiPolygon, calculateAoiAreaSqKm } from "@/map/aoiGeometry";

export type UseWorkflowTimelineOptions = {
  autoPlay: boolean;
  loop: boolean;
  playbackRate: number;
  reducedMotion: boolean;
  testMode: boolean;
  onStageChange?: (stage: WorkflowStage) => void;
  onLoopComplete?: () => void;
};

export type WorkflowTimelineState = {
  stage: WorkflowStage;
  isPlaying: boolean;
  cursor: CursorPoint;
  cursorClickPulse: number;
  typedText: string;
  aoiVertexCount: number;
  aoiFillVisible: boolean;
  aoiAreaSqKm: number;
  selectedDatasetIds: string[];
  cartBadge: number;
  cartButtonLabel: "Add to Cart" | "Added to Cart" | "Proceed Securely";
  secureStageIndex: number;
  downloadStarted: boolean;
  totalPrice: number;
};

const DEMO_AOI_FEATURE = buildDemoAoiPolygon();
const FULL_AOI_AREA_SQ_KM = calculateAoiAreaSqKm(DEMO_AOI_FEATURE);

const INITIAL_STATE: WorkflowTimelineState = {
  stage: FIRST_STAGE,
  isPlaying: false,
  cursor: { xPct: 50, yPct: 92 },
  cursorClickPulse: 0,
  typedText: "",
  aoiVertexCount: 0,
  aoiFillVisible: false,
  aoiAreaSqKm: 0,
  selectedDatasetIds: [],
  cartBadge: 0,
  cartButtonLabel: "Add to Cart",
  secureStageIndex: -1,
  downloadStarted: false,
  totalPrice: 0,
};

export function useWorkflowTimeline(options: UseWorkflowTimelineOptions) {
  const [state, setState] = useState<WorkflowTimelineState>(INITIAL_STATE);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const timeline = buildWorkflowTimeline(
      {
        onStageEnter: (stage) => {
          setState((prev) => ({ ...prev, stage }));
          optionsRef.current.onStageChange?.(stage);
        },
        onCursorMove: (point) => setState((prev) => ({ ...prev, cursor: point })),
        onCursorClick: () => setState((prev) => ({ ...prev, cursorClickPulse: prev.cursorClickPulse + 1 })),
        onTypedTextChange: (typedText) => setState((prev) => ({ ...prev, typedText })),
        onAoiVertexCount: (aoiVertexCount) => setState((prev) => ({ ...prev, aoiVertexCount })),
        onAoiFillVisible: (aoiFillVisible) => setState((prev) => ({ ...prev, aoiFillVisible })),
        onAoiAreaProgress: (progress) =>
          setState((prev) => ({ ...prev, aoiAreaSqKm: FULL_AOI_AREA_SQ_KM * progress })),
        onDatasetSelected: (datasetId, selected) =>
          setState((prev) => {
            const selectedDatasetIds = selected
              ? Array.from(new Set([...prev.selectedDatasetIds, datasetId]))
              : prev.selectedDatasetIds.filter((id) => id !== datasetId);
            const areaForPricing = prev.aoiAreaSqKm || FULL_AOI_AREA_SQ_KM;
            return {
              ...prev,
              selectedDatasetIds,
              totalPrice: calculateTotalPrice(selectedDatasetIds, areaForPricing),
            };
          }),
        onCartBadge: (cartBadge) => setState((prev) => ({ ...prev, cartBadge })),
        onCartButtonLabel: (cartButtonLabel) => setState((prev) => ({ ...prev, cartButtonLabel })),
        onSecureStageIndex: (secureStageIndex) => setState((prev) => ({ ...prev, secureStageIndex })),
        onDownloadClicked: () => setState((prev) => ({ ...prev, downloadStarted: true })),
        onLoopComplete: () => {
          setState((prev) => ({ ...prev, downloadStarted: false }));
          optionsRef.current.onLoopComplete?.();
        },
      },
      {
        reducedMotion: options.reducedMotion,
        testMode: options.testMode,
        loop: options.loop,
        playbackRate: options.playbackRate,
      },
    );

    timelineRef.current = timeline;

    if (options.autoPlay) {
      timeline.play(0);
      setState((prev) => ({ ...prev, isPlaying: true }));
    }

    return () => {
      timeline.kill();
      timelineRef.current = null;
    };
    // Rebuilt only when structural options change; playbackRate/loop are
    // applied imperatively below to avoid restarting mid-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.reducedMotion, options.testMode]);

  useEffect(() => {
    timelineRef.current?.timeScale(options.playbackRate);
  }, [options.playbackRate]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.repeat(options.loop ? -1 : 0);
  }, [options.loop]);

  const play = useCallback(() => {
    timelineRef.current?.play();
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    timelineRef.current?.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    if (timelineRef.current?.isActive() && !timelineRef.current.paused()) {
      pause();
    } else {
      play();
    }
  }, [pause, play]);

  const replay = useCallback(() => {
    setState(INITIAL_STATE);
    timelineRef.current?.restart();
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const seekToStage = useCallback((stage: WorkflowStage) => {
    const speed = optionsRef.current.testMode ? TEST_MODE_SPEED_MULTIPLIER : 1;
    timelineRef.current?.seek(STAGE_TIMES[stage].start / speed);
  }, []);

  const stepStage = useCallback(
    (direction: 1 | -1) => {
      const nextIndex = Math.min(
        WORKFLOW_STAGES.length - 1,
        Math.max(0, stageIndex(state.stage) + direction),
      );
      seekToStage(WORKFLOW_STAGES[nextIndex]);
    },
    [seekToStage, state.stage],
  );

  const timeline = timelineRef.current;

  return useMemo(
    () => ({ state, play, pause, togglePlay, replay, seekToStage, stepStage, timeline }),
    [state, play, pause, togglePlay, replay, seekToStage, stepStage, timeline],
  );
}
