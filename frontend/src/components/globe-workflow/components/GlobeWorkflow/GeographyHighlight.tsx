import { MapPin } from "lucide-react";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  /** Primary label (e.g. INDIA / Karnataka / Bengaluru). */
  label: string;
  /** Optional breadcrumb hierarchy below the label. */
  crumbs?: string[];
  visible: boolean;
  position?: "center" | "northwest";
}

/** Small floating geographic highlight label used during the globe->country->state stages. */
export function GeographyHighlight({ label, crumbs, visible, position = "center" }: Props) {
  return (
    <div
      className={`${styles.geoHighlight} ${styles[`geoHighlight_${position}`]} ${
        visible ? styles.geoHighlightVisible : ""
      }`}
      aria-hidden={!visible}
    >
      <span className={styles.geoHighlightPill}>
        <MapPin className={styles.geoHighlightPin} size={14} strokeWidth={2.2} />
        {label}
      </span>
      {crumbs && crumbs.length > 0 && (
        <span className={styles.geoHighlightCrumbs}>{crumbs.join("  ›  ")}</span>
      )}
    </div>
  );
}
