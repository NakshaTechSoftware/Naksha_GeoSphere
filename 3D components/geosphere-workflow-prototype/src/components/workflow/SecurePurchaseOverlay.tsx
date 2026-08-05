import { ShieldCheck, Check } from "lucide-react";
import { SECURE_PROCESSING_STAGES, DEMO_ORDER_REFERENCE, DEMO_PACKAGE_FORMATS } from "@/data/mockWorkflow";
import type { WorkflowStage } from "@/animation/workflowStages";
import styles from "./GeoWorkflowDemo.module.css";

export type SecurePurchaseOverlayProps = {
  stage: WorkflowStage;
  secureStageIndex: number;
  aoiAreaSqKm: number;
};

export function SecurePurchaseOverlay({ stage, secureStageIndex, aoiAreaSqKm }: SecurePurchaseOverlayProps) {
  const visible = stage === "SECURE_PROCESSING" || stage === "PURCHASE_COMPLETE";
  if (!visible) return null;

  const isComplete = stage === "PURCHASE_COMPLETE";
  const progressPct = isComplete
    ? 100
    : Math.min(100, ((secureStageIndex + 1) / SECURE_PROCESSING_STAGES.length) * 100);

  return (
    <div className={styles.overlayBackdrop} role="presentation">
      <div className={styles.overlayCard}>
        <ShieldCheck size={30} strokeWidth={1.75} className={styles.overlayShield} />

        {!isComplete && (
          <>
            <h4 className={styles.overlayTitle}>Securing your order</h4>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
            <ul className={styles.stageList}>
              {SECURE_PROCESSING_STAGES.slice(0, -1).map((label, index) => {
                const done = index < secureStageIndex || (index === secureStageIndex && index < 4);
                const active = index === secureStageIndex;
                return (
                  <li key={label} className={styles.stageListItem}>
                    <span className={`${styles.stageDot} ${done ? styles.stageDotDone : ""} ${active ? styles.stageDotActive : ""}`}>
                      {done && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {isComplete && (
          <>
            <h4 className={styles.overlayTitle}>Purchase Complete</h4>
            <p className={styles.overlaySubtitle}>Your geospatial data package is ready.</p>
            <dl className={styles.overlayDetails}>
              <div>
                <dt>Order reference</dt>
                <dd>{DEMO_ORDER_REFERENCE}</dd>
              </div>
              <div>
                <dt>File formats</dt>
                <dd>{DEMO_PACKAGE_FORMATS}</dd>
              </div>
              <div>
                <dt>AOI size</dt>
                <dd>{aoiAreaSqKm.toFixed(2)} km²</dd>
              </div>
            </dl>
            <span className={styles.secureDeliveryChip}>
              <ShieldCheck size={13} strokeWidth={2} />
              Secure delivery
            </span>
          </>
        )}
      </div>
    </div>
  );
}
