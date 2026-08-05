import { Check, Image, Mountain, MapPinned, Box } from "lucide-react";
import { DATASET_PRODUCTS } from "@/data/mockDatasets";
import styles from "./GeoWorkflowDemo.module.css";

const ICONS: Record<string, typeof Image> = {
  imagery: Image,
  elevation: Mountain,
  contours: MapPinned,
  "3d": Box,
};

const CARD_LABELS: Record<string, string> = {
  imagery: "Imagery",
  elevation: "Elevation",
  contours: "Contours",
  "3d": "3D View",
};

export type DatasetSwitcherProps = {
  selectedDatasetIds: string[];
};

export function DatasetSwitcher({ selectedDatasetIds }: DatasetSwitcherProps) {
  return (
    <div className={styles.datasetSwitcher} aria-hidden="true">
      {DATASET_PRODUCTS.map((product) => {
        const Icon = ICONS[product.id] ?? Image;
        const selected = selectedDatasetIds.includes(product.id);
        return (
          <div key={product.id} className={`${styles.datasetCard} ${selected ? styles.datasetCardSelected : ""}`}>
            <Icon size={18} strokeWidth={2} />
            <span>{CARD_LABELS[product.id] ?? product.name}</span>
            {selected && <Check size={14} className={styles.datasetCardCheck} />}
          </div>
        );
      })}
    </div>
  );
}
