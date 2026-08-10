import { MousePointer2 } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** Number of polygon vertices placed so far (0 before drawing). */
  vertexCount: number;
  /** Final area once the polygon closes (km², formatted). */
  areaLabel: string;
  areaVisible: boolean;
  cursorTarget?: boolean;
}

/** Overlay showing the AOI drawing progress + the "Selected Area" chip after closure. */
export function AOISelection({
  visible,
  vertexCount,
  areaLabel,
  areaVisible,
  cursorTarget,
}: Props) {
  return (
    <div className={`${styles.aoiOverlay} ${visible ? styles.aoiOverlayVisible : ""}`} aria-hidden={!visible}>
      <div
        className={styles.aoiToolbar}
        data-cursor-target={cursorTarget ? "aoi-button" : undefined}
      >
        <MousePointer2 size={14} strokeWidth={2.4} />
        {vertexCount > 0 ? `Drawing AOI · ${vertexCount} pts` : "Select Area"}
      </div>
      <div className={`${styles.aoiAreaChip} ${areaVisible ? styles.aoiAreaChipVisible : ""}`}>
        <span className={styles.aoiAreaLabel}>Selected Area</span>
        <span className={styles.aoiAreaValue}>{areaLabel}</span>
      </div>
    </div>
  );
}
