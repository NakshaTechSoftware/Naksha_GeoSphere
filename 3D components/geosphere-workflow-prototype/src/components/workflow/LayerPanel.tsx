import { Image, Mountain, Building2, Route, Waves, Trees, MapPinned, Plus } from "lucide-react";
import styles from "./GeoWorkflowDemo.module.css";

const LAYER_ROWS = [
  { id: "imagery", label: "Imagery", Icon: Image },
  { id: "elevation", label: "Elevation", Icon: Mountain },
  { id: "buildings", label: "Buildings", Icon: Building2 },
  { id: "roads", label: "Roads", Icon: Route },
  { id: "hydrography", label: "Hydrography", Icon: Waves },
  { id: "landuse", label: "Land Use", Icon: Trees },
  { id: "contours", label: "Contours", Icon: MapPinned },
] as const;

export type LayerPanelProps = {
  selectedDatasetIds: string[];
};

export function LayerPanel({ selectedDatasetIds }: LayerPanelProps) {
  return (
    <aside className={styles.layerPanel} aria-hidden="true">
      <h3 className={styles.panelHeading}>Layers</h3>
      <ul className={styles.layerList}>
        {LAYER_ROWS.map(({ id, label, Icon }) => {
          const checked = selectedDatasetIds.includes(id);
          return (
            <li key={id} className={styles.layerRow}>
              <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`} />
              <Icon size={15} strokeWidth={2} />
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.addLayerButton} tabIndex={-1}>
        <Plus size={14} />
        Add Layer
      </button>
    </aside>
  );
}
