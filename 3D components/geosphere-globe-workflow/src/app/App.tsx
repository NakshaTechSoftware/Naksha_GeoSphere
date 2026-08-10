import { useState } from "react";
import { GlobeWorkflow } from "../components/GlobeWorkflow/GlobeWorkflow";
import { PrototypeController } from "../controls/PrototypeController";
import { useReducedMotion } from "../hooks/useReducedMotion";
import type { WorkflowController } from "../animation/useWorkflowController";
import "./App.css";

/**
 * Isolated review page. Renders the GlobeWorkflow at the approximate hero size (16/10,
 * 650-850px wide) next to the development review panel. This page is NOT part of the main
 * product - it exists only for manual approval of the prototype.
 */
export default function App() {
  const osReduced = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(osReduced);
  const [stageLog, setStageLog] = useState<string[]>([]);
  const [controller, setController] = useState<WorkflowController | null>(null);

  return (
    <div className="page">
      <header className="pageHeader">
        <div className="pageTitle">
          <span className="pageLogo">◆</span>
          Naksha GeoSphere — Workflow Demonstration
        </div>
        <div className="pageStageLog" aria-live="polite">
          {stageLog.join(" → ") || "Waiting for boot…"}
        </div>
      </header>

      <main className="pageMain">
        <section className="heroSlot" aria-label="Naksha GeoSphere workflow demonstration">
          <GlobeWorkflow
            autoPlay
            loop
            playbackRate={1}
            startLocationIndex={0}
            showPrototypeControls={false}
            reducedMotion={reducedMotion}
            onStageChange={(s) => setStageLog((log) => [...log.slice(-4), s])}
            onControllerReady={setController}
          />
        </section>

        {controller && (
          <aside className="reviewRail">
            <PrototypeController
              controller={controller}
              reducedMotion={reducedMotion}
              onReducedMotionChange={setReducedMotion}
            />
          </aside>
        )}
      </main>

      <footer className="pageFooter">
        Isolated prototype · no real transactions · demo data only
      </footer>
    </div>
  );
}
