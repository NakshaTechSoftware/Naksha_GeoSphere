import { Layers } from "lucide-react";
import { LAYER_OPTIONS } from "../../data/workflowDemo";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** Map of layer id -> checked. */
  checked: Record<string, boolean>;
}

/** White/translucent Layers panel (left). Matches the approved welcome-page visual. */
export function LayerPanel({ visible, checked }: Props) {
  return (
    <aside
      className={`${styles.layerPanel} ${visible ? styles.panelVisible : ""}`}
      aria-hidden={!visible}
    >
      <div className={styles.panelHeader}>
        <Layers size={15} className={styles.panelHeaderIcon} />
        Layers
      </div>
      <div className={styles.layerList}>
        {LAYER_OPTIONS.map((opt) => (
          <label key={opt.id} className={styles.layerRow}>
            <span className={`${styles.checkbox} ${checked[opt.id] ? styles.checkboxOn : ""}`}>
              {checked[opt.id] ? "✓" : ""}
            </span>
            <span className={styles.layerRowLabel}>{opt.label}</span>
          </label>
        ))}
      </div>
    </aside>
  );
}
