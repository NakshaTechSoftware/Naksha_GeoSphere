import { Download, FileArchive, ShieldCheck } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  stage: "button" | "summary";
  packageName: string;
  formats: string[];
  areaLabel: string;
  priceLabel: string;
  cursorTarget?: boolean;
}

/** The EXPORT stage: primary "Export Selected Data" button, then the export summary card. */
export function ExportPanel({ visible, stage, packageName, formats, areaLabel, priceLabel, cursorTarget }: Props) {
  if (!visible) return null;
  return (
    <div className={styles.exportWrap}>
      {stage === "button" ? (
        <button
          className={`${styles.exportButton} ${cursorTarget ? styles.cursorTarget : ""}`}
          data-cursor-target={cursorTarget ? "export-button" : undefined}
          tabIndex={-1}
        >
          <Download size={16} strokeWidth={2.4} />
          Export Selected Data
        </button>
      ) : (
        <div className={styles.exportSummary}>
          <div className={styles.exportSummaryHeader}>
            <FileArchive size={16} className={styles.panelHeaderIcon} />
            Export Package
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataRowKey}>Package</span>
            <span className={styles.dataRowValue}>{packageName}</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataRowKey}>Formats</span>
            <span className={styles.dataRowValue}>{formats.join(" · ")}</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataRowKey}>Area</span>
            <span className={styles.dataRowValue}>{areaLabel}</span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataRowKey}>Secure delivery</span>
            <span className={styles.dataRowValue}>
              <ShieldCheck size={13} className={styles.inlineIcon} /> Enabled
            </span>
          </div>
          <div className={styles.dataRow}>
            <span className={styles.dataRowKey}>Total</span>
            <span className={styles.priceValue}>{priceLabel}</span>
          </div>
          <button className={styles.continueButton} tabIndex={-1} data-cursor-target={cursorTarget ? "continue" : undefined}>
            Continue to Payment
          </button>
        </div>
      )}
    </div>
  );
}
