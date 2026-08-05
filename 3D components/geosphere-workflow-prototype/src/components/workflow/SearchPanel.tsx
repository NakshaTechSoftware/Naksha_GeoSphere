import { Search, MapPin } from "lucide-react";
import type { WorkflowStage } from "@/animation/workflowStages";
import styles from "./GeoWorkflowDemo.module.css";

export type SearchPanelProps = {
  typedText: string;
  stage: WorkflowStage;
};

export function SearchPanel({ typedText, stage }: SearchPanelProps) {
  const showSuggestion = stage === "SEARCH" && typedText.length > 3;

  return (
    <div className={styles.searchPanel} aria-hidden="true">
      <div className={styles.searchInputRow}>
        <Search size={16} strokeWidth={2} />
        <span className={styles.searchInputText}>
          {typedText || "Search location"}
          {stage === "SEARCH" && <span className={styles.searchCaret} />}
        </span>
      </div>
      {showSuggestion && (
        <div className={styles.searchSuggestion}>
          <MapPin size={14} strokeWidth={2} />
          <span>Bengaluru, Karnataka, India</span>
        </div>
      )}
    </div>
  );
}
