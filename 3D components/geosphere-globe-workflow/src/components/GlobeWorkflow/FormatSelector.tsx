import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  formats: string[];
}

/** Inline format chips shown during FORMAT_SELECTION. */
export function FormatSelector({ visible, formats }: Props) {
  return (
    <div className={`${styles.formatSelector} ${visible ? styles.formatSelectorVisible : ""}`} aria-hidden={!visible}>
      {formats.map((f) => (
        <span key={f} className={styles.formatChip}>
          {f}
        </span>
      ))}
    </div>
  );
}
