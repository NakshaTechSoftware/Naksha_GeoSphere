import { ShieldCheck } from "lucide-react";
import { PROCESSING_STEPS } from "../../data/workflowDemo";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** 0-100 progress. */
  progress: number;
  /** Current step label. */
  stepLabel: string;
}

/** "Preparing Your Data" with elegant progress (circular ring + step list). */
export function SecureProcessing({ visible, progress, stepLabel }: Props) {
  if (!visible) return null;
  const R = 26;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - Math.min(100, Math.max(0, progress)) / 100);

  return (
    <div className={styles.processingPanel}>
      <div className={styles.processingHeader}>
        <ShieldCheck size={16} className={styles.panelHeaderIcon} />
        Preparing Your Data
      </div>

      <div className={styles.progressRingWrap}>
        <svg width="72" height="72" viewBox="0 0 72 72" className={styles.progressRing}>
          <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(53,99,233,0.12)" strokeWidth="5" />
          <circle
            cx="36"
            cy="36"
            r={R}
            fill="none"
            stroke="#3563e9"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            transform="rotate(-90 36 36)"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div className={styles.progressPct}>{Math.round(progress)}%</div>
      </div>

      <div className={styles.processingStepLabel}>{stepLabel}</div>

      <ul className={styles.processingSteps}>
        {PROCESSING_STEPS.map((s) => (
          <li
            key={s.label}
            className={`${styles.processingStep} ${
              progress >= s.pct ? styles.processingStepDone : ""
            }`}
          >
            <span className={styles.processingStepIcon}>
              {progress >= s.pct ? "✓" : "·"}
            </span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
