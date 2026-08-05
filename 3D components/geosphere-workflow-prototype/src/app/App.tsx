import { useState } from "react";
import { GeoWorkflowDemo } from "@/components/workflow/GeoWorkflowDemo";
import type { WorkflowStage } from "@/animation/workflowStages";
import "./App.css";

/**
 * Standalone review harness. This page — and everything else in this
 * folder — is intentionally isolated from the main Naksha GeoSphere
 * application. It exists only so GeoWorkflowDemo can be viewed and
 * reviewed before integration.
 */
export function App() {
  const [stage, setStage] = useState<WorkflowStage>("INITIALIZE");
  const [loopCount, setLoopCount] = useState(0);

  return (
    <main className="reviewPage">
      <header className="reviewHeader">
        <p className="reviewEyebrow">Naksha GeoSphere — Isolated Prototype</p>
        <h1>Geosphere Workflow Demo</h1>
        <p className="reviewSubtitle">
          Cinematic, looping preview of the search → AOI → purchase → download customer journey. This
          page is for visual and technical review only and is not part of the production application.
        </p>
      </header>

      <div className="reviewStats" aria-hidden="true">
        <span>
          Stage: <strong>{stage.replace(/_/g, " ")}</strong>
        </span>
        <span>
          Loops completed: <strong>{loopCount}</strong>
        </span>
      </div>

      <div className="reviewStage">
        <GeoWorkflowDemo
          autoPlay
          loop
          showPrototypeControls
          onStageChange={setStage}
          onLoopComplete={() => setLoopCount((count) => count + 1)}
        />
      </div>
    </main>
  );
}
