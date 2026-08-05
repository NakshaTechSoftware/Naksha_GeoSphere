import type { WorkflowStage } from "@/animation/workflowStages";
import { LayerPanel } from "./LayerPanel";
import { SearchPanel } from "./SearchPanel";
import { SelectedDataPanel } from "./SelectedDataPanel";
import { DatasetSwitcher } from "./DatasetSwitcher";
import styles from "./GeoWorkflowDemo.module.css";

export type WorkflowPanelsProps = {
  stage: WorkflowStage;
  typedText: string;
  selectedDatasetIds: string[];
  aoiAreaSqKm: number;
  totalPrice: number;
  cartBadge: number;
  cartButtonLabel: "Add to Cart" | "Added to Cart" | "Proceed Securely";
};

/** MAP_BUILD reveals panels in sequence; everything after stays mounted and just updates. */
export function WorkflowPanels({
  stage,
  typedText,
  selectedDatasetIds,
  aoiAreaSqKm,
  totalPrice,
  cartBadge,
  cartButtonLabel,
}: WorkflowPanelsProps) {
  const revealed = stage !== "INITIALIZE";

  return (
    <div className={`${styles.panelsLayer} ${revealed ? styles.panelsRevealed : ""}`}>
      <div className={styles.panelSlotLeft}>
        <LayerPanel selectedDatasetIds={selectedDatasetIds} />
      </div>
      <div className={styles.panelSlotTop}>
        <SearchPanel typedText={typedText} stage={stage} />
      </div>
      <div className={styles.panelSlotRight}>
        <SelectedDataPanel
          selectedDatasetIds={selectedDatasetIds}
          aoiAreaSqKm={aoiAreaSqKm}
          totalPrice={totalPrice}
          cartBadge={cartBadge}
          cartButtonLabel={cartButtonLabel}
        />
      </div>
      <div className={styles.panelSlotBottom}>
        <DatasetSwitcher selectedDatasetIds={selectedDatasetIds} />
      </div>
    </div>
  );
}
