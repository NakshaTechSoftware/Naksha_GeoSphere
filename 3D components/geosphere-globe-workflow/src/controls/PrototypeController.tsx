import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Repeat,
  Gauge,
} from "lucide-react";
import { WORKFLOW_STAGES, type WorkflowStage } from "../animation/workflowStages";
import type { WorkflowController } from "../animation/useWorkflowController";
import { WORKFLOW_LOCATIONS } from "../data/locations";
import styles from "./PrototypeController.module.css";

interface Props {
  controller: WorkflowController;
  reducedMotion: boolean;
  onReducedMotionChange: (v: boolean) => void;
}

/** DEVELOPMENT REVIEW ONLY - play/pause/seek/location/speed controls. */
export function PrototypeController({ controller, reducedMotion, onReducedMotionChange }: Props) {
  const { controls, stage, locationIndex, timelinePosition, elapsedSeconds, fps, isPlaying, isLooping, playbackRate } = controller;
  const [positionText, setPositionText] = useState("0.0s");

  useEffect(() => {
    setPositionText(`${elapsedSeconds.toFixed(1)}s / ${(timelinePosition * 100).toFixed(1)}%`);
  }, [elapsedSeconds, timelinePosition]);

  return (
    <div className={styles.panel} data-testid="prototype-controls">
      <div className={styles.header}>
        <Gauge size={14} />
        Prototype Review
      </div>

      <div className={styles.row}>
        <div className={styles.stageBadge}>{stage}</div>
        <div className={styles.meta}>
          <span>{WORKFLOW_LOCATIONS[locationIndex % WORKFLOW_LOCATIONS.length].city}</span>
          <span>{positionText}</span>
          <span>{fps} fps</span>
        </div>
      </div>

      <div className={styles.buttons}>
        <button onClick={controls.prevStage} title="Previous stage" aria-label="Previous stage">
          <SkipBack size={14} />
        </button>
        <button
          onClick={controls.togglePlay}
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={styles.primary}
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={controls.nextStage} title="Next stage" aria-label="Next stage">
          <SkipForward size={14} />
        </button>
        <button onClick={controls.restart} title="Restart" aria-label="Restart">
          <RotateCcw size={14} />
        </button>
        <button
          onClick={() => controls.setLooping(!isLooping)}
          title={`Loop ${isLooping ? "ON" : "OFF"}`}
          aria-label={`Loop ${isLooping ? "ON" : "OFF"}`}
          className={isLooping ? styles.active : ""}
        >
          <Repeat size={14} />
        </button>
      </div>

      <div className={styles.rateRow}>
        <span className={styles.label}>Speed</span>
        {[0.5, 1, 1.5, 2].map((r) => (
          <button
            key={r}
            className={playbackRate === r ? styles.active : ""}
            onClick={() => controls.setPlaybackRate(r)}
          >
            {r}×
          </button>
        ))}
      </div>

      <div className={styles.locationRow}>
        <span className={styles.label}>Location</span>
        <select
          value={locationIndex % WORKFLOW_LOCATIONS.length}
          onChange={(e) => controls.setLocationIndex(Number(e.target.value))}
        >
          {WORKFLOW_LOCATIONS.map((loc, i) => (
            <option key={loc.city} value={i}>
              {loc.city}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.stageList}>
        {WORKFLOW_STAGES.map((s) => (
          <button
            key={s}
            className={s === stage ? styles.stageActive : ""}
            onClick={() => controls.seekToStage(s as WorkflowStage)}
          >
            {s}
          </button>
        ))}
      </div>

      <label className={styles.reducedRow}>
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => onReducedMotionChange(e.target.checked)}
        />
        Reduced Motion Preview
      </label>
    </div>
  );
}
