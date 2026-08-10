import { Mail, ShieldCheck, Link2, Clock } from "lucide-react";
import { DEMO_EMAIL, SECURE_DELIVERY_EXPIRY } from "../../data/workflowDemo";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** "sending" | "sent" */
  status: "sending" | "sent";
}

/** Envelope + secure package animation for EMAIL_DELIVERY. */
export function EmailDelivery({ visible, status }: Props) {
  if (!visible) return null;
  return (
    <div className={styles.emailPanel}>
      <div className={styles.emailStage}>
        <div className={styles.envelopeWrap}>
          <img
            src="/assets/secure-package.svg"
            alt=""
            className={`${styles.securePackage} ${status === "sending" ? styles.securePackageSending : ""}`}
            draggable={false}
          />
          <div className={styles.envelope}>
            <div className={styles.envelopeBody}>
              <span className={styles.envelopeFlap} />
              <Mail size={22} className={styles.envelopeIcon} />
            </div>
          </div>
        </div>
        <div className={styles.emailTitle}>
          {status === "sending" ? "Sending to your email…" : "Delivered Successfully"}
        </div>
        <div className={styles.emailTo}>{DEMO_EMAIL}</div>
        <div className={styles.emailSupport}>
          Your secure geospatial data link has been sent to your email.
        </div>
      </div>

      {status === "sent" && (
        <div className={styles.emailMeta}>
          <div className={styles.emailMetaRow}>
            <ShieldCheck size={14} className={styles.inlineIcon} />
            <span>KML / KMZ · GeoTIFF</span>
          </div>
          <div className={styles.emailMetaRow}>
            <Link2 size={14} className={styles.inlineIcon} />
            <span>Secure Download Link</span>
          </div>
          <div className={styles.emailMetaRow}>
            <Clock size={14} className={styles.inlineIcon} />
            <span>Expiration: {SECURE_DELIVERY_EXPIRY}</span>
          </div>
        </div>
      )}
    </div>
  );
}
