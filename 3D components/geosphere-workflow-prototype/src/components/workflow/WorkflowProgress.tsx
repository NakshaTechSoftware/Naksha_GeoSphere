import type { WorkflowStage } from "@/animation/workflowStages";
import styles from "./GeoWorkflowDemo.module.css";

const STAGE_DESCRIPTIONS: Record<WorkflowStage, string> = {
  INITIALIZE: "Preparing the demonstration.",
  MAP_BUILD: "Building the map view.",
  SEARCH: "Searching for Bengaluru, Karnataka.",
  CAMERA_FLY: "Flying to Bengaluru.",
  AOI_DRAW: "Drawing the area of interest.",
  DATA_DISCOVERY: "Discovering available datasets for the selected area.",
  DATA_SELECTION: "Selecting imagery and elevation datasets.",
  ADD_TO_CART: "Adding selected datasets to the cart.",
  SECURE_PROCESSING: "Securely processing the order.",
  PURCHASE_COMPLETE: "Purchase complete.",
  DOWNLOAD_READY: "Preparing the secure download.",
  RESET: "Resetting the demonstration.",
};

export type WorkflowProgressProps = {
  stage: WorkflowStage;
};

export function WorkflowProgress({ stage }: WorkflowProgressProps) {
  return (
    <>
      <p className="visually-hidden">
        Animated demonstration showing how a user searches for Bengaluru, draws an area of interest,
        selects imagery and elevation datasets, adds them to a cart, purchases securely and downloads
        the prepared package.
      </p>
      <p className="visually-hidden" aria-live="polite">
        {STAGE_DESCRIPTIONS[stage]}
      </p>
      <div className={styles.progressLabel} aria-hidden="true">
        {stage.replace(/_/g, " ")}
      </div>
    </>
  );
}
