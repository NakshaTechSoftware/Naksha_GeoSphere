import { useEffect, useState } from "react";
import type { CursorPoint } from "@/animation/workflowTimeline";
import styles from "./GeoWorkflowDemo.module.css";

export type WorkflowCursorProps = {
  point: CursorPoint;
  clickPulse: number;
  visible: boolean;
};

/**
 * Decorative simulated cursor only — never replaces the user's real
 * browser cursor, stays inside the component boundary, and is hidden
 * from assistive technology.
 */
export function WorkflowCursor({ point, clickPulse, visible }: WorkflowCursorProps) {
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    if (clickPulse === 0) return;
    setClicking(true);
    const timeout = window.setTimeout(() => setClicking(false), 260);
    return () => window.clearTimeout(timeout);
  }, [clickPulse]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="workflow-cursor"
      className={`${styles.workflowCursor} ${clicking ? styles.workflowCursorClicking : ""}`}
      style={{ left: `${point.xPct}%`, top: `${point.yPct}%` }}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M3 1.5 L3 18.5 L7.5 14.8 L10.3 20.5 L13 19.2 L10.2 13.5 L16 13 Z"
          fill="var(--ngs-obsidian)"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      {clicking && <span className={styles.workflowCursorRing} />}
    </div>
  );
}
