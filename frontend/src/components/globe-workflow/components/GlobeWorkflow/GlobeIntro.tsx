import styles from "./GlobeWorkflow.module.css";

/** Boot/GLOBE_INTRO overlay - product wordmark, no heavy effects. */
export function GlobeIntro({ visible }: { visible: boolean }) {
  return (
    <div
      className={`${styles.globeIntro} ${visible ? styles.globeIntroVisible : ""}`}
      aria-hidden={!visible}
    >
      <div className={styles.globeIntroBadge}>NAKSHA GEOSPHERE</div>
      <div className={styles.globeIntroTitle}>Geospatial Data, Delivered</div>
      <div className={styles.globeIntroSub}>One secure workflow — from map to mailbox</div>
    </div>
  );
}
