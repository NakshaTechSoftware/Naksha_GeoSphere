import { DownloadCloud, FileArchive, Lock } from "lucide-react";
import { DEMO_PACKAGE_FILENAME, DEMO_PACKAGE_FORMATS, DEMO_PACKAGE_SIZE } from "@/data/mockWorkflow";
import type { WorkflowStage } from "@/animation/workflowStages";
import styles from "./GeoWorkflowDemo.module.css";

export type DownloadCompleteOverlayProps = {
  stage: WorkflowStage;
  downloadStarted: boolean;
};

export function DownloadCompleteOverlay({ stage, downloadStarted }: DownloadCompleteOverlayProps) {
  if (stage !== "DOWNLOAD_READY") return null;

  return (
    <div className={styles.overlayBackdrop} role="presentation">
      <div className={styles.overlayCard}>
        <DownloadCloud size={30} strokeWidth={1.75} className={styles.overlayShield} />
        <h4 className={styles.overlayTitle}>Download Ready</h4>

        <div className={styles.packageCard}>
          <FileArchive size={20} strokeWidth={1.75} />
          <div className={styles.packageCardText}>
            <span className={styles.packageCardName}>{DEMO_PACKAGE_FILENAME}</span>
            <span className={styles.packageCardMeta}>
              {DEMO_PACKAGE_FORMATS} · {DEMO_PACKAGE_SIZE}
            </span>
          </div>
        </div>

        <span className={styles.secureDeliveryChip}>
          <Lock size={13} strokeWidth={2} />
          Secure download ready
        </span>

        <button type="button" className={styles.downloadButton} tabIndex={-1}>
          Download Securely
        </button>

        {downloadStarted && <p className={styles.downloadConfirmation}>Download Started</p>}
      </div>
    </div>
  );
}
