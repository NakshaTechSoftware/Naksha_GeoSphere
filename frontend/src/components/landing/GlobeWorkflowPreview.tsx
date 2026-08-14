"use client";

import { GlobeWorkflow } from "@/components/globe-workflow/components/GlobeWorkflow/GlobeWorkflow";

/**
 * Welcome-page hero slot for the looping 3D workflow demonstration.
 *
 * The GlobeWorkflow component is self-contained (its own GSAP timeline drives the
 * globe -> India -> Karnataka -> local city -> AOI -> data -> export -> payment ->
 * delivery journey); this wrapper only sizes it like the previous hero card (rounded
 * corners, border, soft shadow).
 */
export function GlobeWorkflowPreview() {
  return (
    <div className="relative flex items-start">
      {/* Transparent rounded box: no background fill and no border, so only the globe
          sphere (+ its pale-blue atmosphere halo) is visible and floats on the page.
          The aspect ratio keeps it hero-sized like the old static card. */}
      <div className="w-full overflow-hidden">
        <div className="relative h-[60vh] max-h-[520px] min-h-[360px] w-full">
          <GlobeWorkflow showPrototypeControls={false} />
        </div>
      </div>
    </div>
  );
}
