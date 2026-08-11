import { CreditCard, Lock, Loader2, CheckCircle2 } from "lucide-react";
import { PAYMENT_METHODS } from "../../data/workflowDemo";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  priceLabel: string;
  packageName: string;
  /** "idle" | "processing" | "verified" */
  status: "idle" | "processing" | "verified";
  message: string;
  cursorTarget?: boolean;
}

/** Compact symbolic payment panel - NO real gateway, no real card fields. */
export function PaymentPanel({ visible, priceLabel, packageName, status, message, cursorTarget }: Props) {
  if (!visible) return null;
  return (
    <div className={styles.paymentPanel}>
      <div className={styles.panelHeader}>
        <CreditCard size={15} className={styles.panelHeaderIcon} />
        Secure Payment
      </div>

      <div className={styles.paymentSummary}>
        <div className={styles.dataRow}>
          <span className={styles.dataRowKey}>Order Summary</span>
          <span className={styles.dataRowValue}>{packageName}</span>
        </div>
        <div className={styles.dataRow}>
          <span className={styles.dataRowKey}>Includes</span>
          <span className={styles.dataRowValue}>KML / KMZ · Premium Imagery</span>
        </div>
        <div className={styles.dataRow}>
          <span className={styles.dataRowKey}>Total</span>
          <span className={styles.priceValue}>{priceLabel}</span>
        </div>
      </div>

      <div className={styles.paymentMethods}>
        {PAYMENT_METHODS.map((m) => (
          <span key={m} className={styles.paymentMethodChip}>
            {m}
          </span>
        ))}
      </div>

      {status === "idle" ? (
        <button
          className={`${styles.payButton} ${cursorTarget ? styles.cursorTarget : ""}`}
          data-cursor-target={cursorTarget ? "pay" : undefined}
          tabIndex={-1}
        >
          <Lock size={14} strokeWidth={2.4} />
          Pay Securely
        </button>
      ) : (
        <div className={styles.paymentStatus}>
          {status === "processing" ? (
            <Loader2 size={16} className={styles.spinner} />
          ) : (
            <CheckCircle2 size={16} className={styles.verifiedIcon} />
          )}
          {message}
        </div>
      )}
    </div>
  );
}
