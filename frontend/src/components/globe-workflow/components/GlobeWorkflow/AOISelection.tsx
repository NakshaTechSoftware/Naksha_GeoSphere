import { MousePointer2 } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** Number of polygon vertices placed so far (0 before drawing). */
  vertexCount: number;
  cursorTarget?: boolean;
}

/** Overlay showing the AOI drawing progress (the "Draw AOI" toolbar / pts counter). */
export function AOISelection({ visible, vertexCount, cursorTarget }: Props) {
  return (
    <div className={`${styles.aoiOverlay} ${visible ? styles.aoiOverlayVisible : ""}`} aria-hidden={!visible}>
      <div
        className={`${styles.aoiToolbar} ${vertexCount === 0 ? styles.aoiToolbarButton : ""}`}
        data-cursor-target={cursorTarget ? "aoi-button" : undefined}
      >
        <MousePointer2 size={14} strokeWidth={2.4} />
        {vertexCount > 0 ? `Drawing AOI · ${vertexCount} pts` : "Draw AOI"}
      </div>
    </div>
  );
}
