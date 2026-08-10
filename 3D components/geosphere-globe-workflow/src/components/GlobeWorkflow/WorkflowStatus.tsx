import { Activity } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  stageLabel: string;
  locationLabel: string;
}

/** Subtle bottom status line announcing the current workflow phase (aria-live polite). */
export function WorkflowStatus({ visible, stageLabel, locationLabel }: Props) {
  return (
    <div
      className={`${styles.workflowStatus} ${visible ? styles.workflowStatusVisible : ""}`}
      aria-live="polite"
    >
      <Activity size={13} className={styles.workflowStatusIcon} />
      <span className={styles.workflowStatusStage}>{stageLabel}</span>
      <span className={styles.workflowStatusDivider}>·</span>
      <span className={styles.workflowStatusLocation}>{locationLabel}</span>
    </div>
  );
}
