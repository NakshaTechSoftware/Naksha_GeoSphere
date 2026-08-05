import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Repeat, Accessibility } from "lucide-react";
import { type WorkflowStage } from "@/animation/workflowStages";
import styles from "./PrototypeControls.module.css";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

export type PrototypeControlsProps = {
  stage: WorkflowStage;
  isPlaying: boolean;
  loop: boolean;
  playbackRate: number;
  reducedMotionPreview: boolean;
  timeline: gsap.core.Timeline | null;
  onTogglePlay: () => void;
  onReplay: () => void;
  onStepStage: (direction: 1 | -1) => void;
  onSeekToStage: (stage: WorkflowStage) => void;
  onSetPlaybackRate: (rate: number) => void;
  onToggleLoop: () => void;
  onToggleReducedMotionPreview: () => void;
};

/**
 * Internal review-only controls. Never rendered inside the future
 * production embed unless the host explicitly passes
 * showPrototypeControls.
 */
export function PrototypeControls({
  stage,
  isPlaying,
  loop,
  playbackRate,
  reducedMotionPreview,
  timeline,
  onTogglePlay,
  onReplay,
  onStepStage,
  onSetPlaybackRate,
  onToggleLoop,
  onToggleReducedMotionPreview,
}: PrototypeControlsProps) {
  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    function tick() {
      if (timeline) setElapsed(timeline.time());
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [timeline]);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        onTogglePlay();
      } else if (event.key === "r" || event.key === "R") {
        onReplay();
      } else if (event.key === "ArrowLeft") {
        onStepStage(-1);
      } else if (event.key === "ArrowRight") {
        onStepStage(1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePlay, onReplay, onStepStage]);

  return (
    <div className={styles.controls} role="group" aria-label="Prototype playback controls">
      <div className={styles.row}>
        <button
          type="button"
          onClick={onTogglePlay}
          className={styles.iconButton}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" onClick={onReplay} className={styles.iconButton} aria-label="Replay">
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={() => onStepStage(-1)}
          className={styles.iconButton}
          aria-label="Previous stage"
        >
          <SkipBack size={14} />
        </button>
        <button type="button" onClick={() => onStepStage(1)} className={styles.iconButton} aria-label="Next stage">
          <SkipForward size={14} />
        </button>

        <button
          type="button"
          onClick={onToggleLoop}
          className={`${styles.iconButton} ${loop ? styles.iconButtonActive : ""}`}
          aria-pressed={loop}
          aria-label="Toggle loop"
        >
          <Repeat size={14} />
        </button>

        <button
          type="button"
          onClick={onToggleReducedMotionPreview}
          className={`${styles.iconButton} ${reducedMotionPreview ? styles.iconButtonActive : ""}`}
          aria-pressed={reducedMotionPreview}
          aria-label="Preview reduced motion mode"
        >
          <Accessibility size={14} />
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.speedGroup} role="group" aria-label="Playback speed">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.speedButton} ${playbackRate === value ? styles.speedButtonActive : ""}`}
              onClick={() => onSetPlaybackRate(value)}
              aria-pressed={playbackRate === value}
            >
              {value}×
            </button>
          ))}
        </div>

        <span className={styles.stageLabel}>{stage.replace(/_/g, " ")}</span>
        <span className={styles.timeLabel}>{elapsed.toFixed(1)}s</span>
      </div>
    </div>
  );
}
