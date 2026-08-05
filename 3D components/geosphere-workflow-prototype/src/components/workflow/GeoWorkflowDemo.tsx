import { useCallback, useRef, useState } from "react";
import { useWorkflowTimeline } from "@/animation/useWorkflowTimeline";
import type { WorkflowStage } from "@/animation/workflowStages";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useVisibilityPause } from "@/hooks/useVisibilityPause";
import { IS_TEST_MODE } from "@/map/mapConfig";
import { WorkflowMap } from "./WorkflowMap";
import { WorkflowPanels } from "./WorkflowPanels";
import { WorkflowCursor } from "./WorkflowCursor";
import { WorkflowProgress } from "./WorkflowProgress";
import { SecurePurchaseOverlay } from "./SecurePurchaseOverlay";
import { DownloadCompleteOverlay } from "./DownloadCompleteOverlay";
import { PrototypeControls } from "@/components/controls/PrototypeControls";
import styles from "./GeoWorkflowDemo.module.css";

export type GeoWorkflowDemoProps = {
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  showPrototypeControls?: boolean;
  playbackRate?: number;
  className?: string;
  onStageChange?: (stage: WorkflowStage) => void;
  onLoopComplete?: () => void;
};

/**
 * Cinematic, looping demonstration of the Naksha GeoSphere workflow:
 * search -> navigate -> AOI -> discover -> select -> cart -> secure
 * purchase -> download -> reset. Fully self-contained: no dependency on
 * global page state, and every GSAP timeline / MapLibre instance /
 * listener / observer it creates is torn down on unmount.
 *
 * `muted` is accepted for API-contract parity with the future embedded
 * hero (which may sit beside audio/video elements) — this component has
 * no audio of its own.
 */
export function GeoWorkflowDemo({
  autoPlay = true,
  loop = true,
  muted: _muted = true,
  showPrototypeControls = true,
  playbackRate = 1,
  className,
  onStageChange,
  onLoopComplete,
}: GeoWorkflowDemoProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const systemReducedMotion = useReducedMotion();

  // Review-only overrides exposed through PrototypeControls. The future
  // production embed drives these purely from props (showPrototypeControls
  // is false there), so this local state never affects the public API.
  const [loopOverride, setLoopOverride] = useState(loop);
  const [playbackRateOverride, setPlaybackRateOverride] = useState(playbackRate);
  const [reducedMotionPreview, setReducedMotionPreview] = useState(false);

  const effectiveReducedMotion = reducedMotionPreview || systemReducedMotion;

  const { state, play, pause, togglePlay, replay, seekToStage, stepStage, timeline } = useWorkflowTimeline({
    autoPlay,
    loop: loopOverride,
    playbackRate: playbackRateOverride,
    reducedMotion: effectiveReducedMotion,
    testMode: IS_TEST_MODE,
    onStageChange,
    onLoopComplete,
  });

  const wasPlayingBeforeHideRef = useRef(false);
  const handleHide = useCallback(() => {
    wasPlayingBeforeHideRef.current = state.isPlaying;
    pause();
  }, [pause, state.isPlaying]);
  const handleShow = useCallback(() => {
    if (wasPlayingBeforeHideRef.current) play();
  }, [play]);

  useVisibilityPause(containerRef, handleHide, handleShow, true);

  return (
    <div ref={containerRef} className={`${styles.root} ${className ?? ""}`}>
      <WorkflowProgress stage={state.stage} />

      <div className={styles.frame}>
        <WorkflowMap
          stage={state.stage}
          aoiVertexCount={state.aoiVertexCount}
          aoiFillVisible={state.aoiFillVisible}
          reducedMotion={effectiveReducedMotion}
        />

        <WorkflowPanels
          stage={state.stage}
          typedText={state.typedText}
          selectedDatasetIds={state.selectedDatasetIds}
          aoiAreaSqKm={state.aoiAreaSqKm}
          totalPrice={state.totalPrice}
          cartBadge={state.cartBadge}
          cartButtonLabel={state.cartButtonLabel}
        />

        <WorkflowCursor point={state.cursor} clickPulse={state.cursorClickPulse} visible={!effectiveReducedMotion} />

        <SecurePurchaseOverlay
          stage={state.stage}
          secureStageIndex={state.secureStageIndex}
          aoiAreaSqKm={state.aoiAreaSqKm}
        />
        <DownloadCompleteOverlay stage={state.stage} downloadStarted={state.downloadStarted} />
      </div>

      {showPrototypeControls && (
        <PrototypeControls
          stage={state.stage}
          isPlaying={state.isPlaying}
          loop={loopOverride}
          playbackRate={playbackRateOverride}
          reducedMotionPreview={reducedMotionPreview}
          timeline={timeline}
          onTogglePlay={togglePlay}
          onReplay={replay}
          onStepStage={stepStage}
          onSeekToStage={seekToStage}
          onSetPlaybackRate={setPlaybackRateOverride}
          onToggleLoop={() => setLoopOverride((prev) => !prev)}
          onToggleReducedMotionPreview={() => setReducedMotionPreview((prev) => !prev)}
        />
      )}
    </div>
  );
}
