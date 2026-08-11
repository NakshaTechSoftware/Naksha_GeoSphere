import { CheckCircle2 } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
}

const STATUS_ITEMS = ["Area Selected", "Payment Complete", "Data Delivered"];

/** Premium enterprise-grade success state. No confetti, no fireworks. */
export function CompletionState({ visible }: Props) {
  return (
    <div className={`${styles.completion} ${visible ? styles.completionVisible : ""}`} aria-hidden={!visible}>
      <div className={styles.completionCheck}>
        <CheckCircle2 size={44} strokeWidth={1.6} />
      </div>
      <div className={styles.completionTitle}>Data Delivered Securely</div>
      <div className={styles.completionSupport}>
        Your requested geospatial package is ready and the secure download link has been sent
        to your email.
      </div>
      <div className={styles.completionStatusList}>
        {STATUS_ITEMS.map((item) => (
          <div key={item} className={styles.completionStatusItem}>
            <span className={styles.completionStatusDot}>✓</span>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
