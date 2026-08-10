import { Package } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  locationLabel: string;
  areaLabel: string;
  /** Selected dataset names, populated progressively. */
  datasets: string[];
  formats: string[];
  priceLabel: string;
  priceVisible: boolean;
}

/** Right-side white/translucent "Selected Data" panel. */
export function DataPanel({
  visible,
  locationLabel,
  areaLabel,
  datasets,
  formats,
  priceLabel,
  priceVisible,
}: Props) {
  return (
    <aside className={`${styles.dataPanel} ${visible ? styles.panelVisible : ""}`} aria-hidden={!visible}>
      <div className={styles.panelHeader}>
        <Package size={15} className={styles.panelHeaderIcon} />
        Selected Data
      </div>
      <div className={styles.dataRow}>
        <span className={styles.dataRowKey}>Selected Area</span>
        <span className={styles.dataRowValue}>{locationLabel}</span>
      </div>
      <div className={styles.dataRow}>
        <span className={styles.dataRowKey}>Area</span>
        <span className={styles.dataRowValue}>{areaLabel}</span>
      </div>
      <div className={styles.dataRow}>
        <span className={styles.dataRowKey}>Selected datasets</span>
        <span className={styles.dataRowValue}>
          {datasets.length ? datasets.join(" · ") : "—"}
        </span>
      </div>
      <div className={styles.dataRow}>
        <span className={styles.dataRowKey}>Available format</span>
        <span className={styles.dataRowValue}>{formats.length ? formats.join(" · ") : "—"}</span>
      </div>
      <div className={styles.dataRow}>
        <span className={styles.dataRowKey}>Estimated Price</span>
        <span className={`${styles.priceValue} ${priceVisible ? styles.priceVisible : ""}`}>
          {priceLabel}
        </span>
      </div>
    </aside>
  );
}
