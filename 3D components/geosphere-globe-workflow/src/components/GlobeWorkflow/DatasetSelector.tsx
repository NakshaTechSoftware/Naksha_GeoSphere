import { CATALOGUE } from "../../data/datasets";
import styles from "./GlobeWorkflow.module.css";

interface Props {
  visible: boolean;
  /** Dataset ids currently selected (highlighted). */
  selected: string[];
  cursorTarget?: boolean;
}

/** Bottom dataset cards - the approved white cards, highlight the demo selection. */
export function DatasetSelector({ visible, selected, cursorTarget }: Props) {
  return (
    <div className={`${styles.datasetSelector} ${visible ? styles.panelVisible : ""}`} aria-hidden={!visible}>
      {CATALOGUE.map((ds) => {
        const isSelected = selected.includes(ds.id);
        return (
          <div
            key={ds.id}
            className={`${styles.datasetCard} ${isSelected ? styles.datasetCardSelected : ""}`}
            data-cursor-target={cursorTarget && ds.id === "kml" ? "dataset-kml" : undefined}
          >
            <img src={ds.preview} alt="" className={styles.datasetPreview} draggable={false} />
            <div className={styles.datasetName}>{ds.name}</div>
            {isSelected && <div className={styles.datasetCheck}>✓</div>}
          </div>
        );
      })}
    </div>
  );
}
