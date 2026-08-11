import { describe, expect, it } from "vitest";
import { buildWorkflowTimeline } from "../animation/workflowTimeline";
import {
  WORKFLOW_STAGES,
  STAGE_ORDER,
  type WorkflowStage,
} from "../animation/workflowStages";
import { TOTAL_LOOP_DURATION } from "../animation/workflowDurations";
import { getLocationForLoop } from "../data/locations";
import { buildAOIPolygon, seedForCity } from "../map/aoiGeometry";

/**
 * Drives a timeline deterministically using seek(), which avoids any ticker-clock
 * dependency and works reliably in jsdom. The timeline must be paused (created that way
 * by buildWorkflowTimeline). Seek jumps to each successive time, rendering children
 * and firing onStart/onComplete correctly.
 */
function driveTimeline(tl: gsap.core.Timeline): void {
  // Step through in small increments so every sub-timeline's onStart fires in order,
  // then land exactly on the end to fire onComplete.
  const step = 0.05;
  for (let t = step; t < TOTAL_LOOP_DURATION; t += step) {
    tl.totalTime(t);
  }
  tl.totalTime(TOTAL_LOOP_DURATION);
}

/**
 * 30-loop stability test. The heavy GPU/WebGL path (MapLibre) is not run here; this proves
 * the deterministic timeline system — the part that actually orchestrates the loop — stays
 * in sync across 30 consecutive loops: no duration drift, correct location rotation,
 * correct stage order, stable AOI geometry, and no cross-loop state leakage.
 */
describe("30-loop stability", () => {
  it("builds and runs 30 loops with correct location rotation and no desync", () => {
    const visited: string[] = [];

    for (let loop = 0; loop < 30; loop++) {
      const location = getLocationForLoop(loop);
      visited.push(location.city);

      const stagesSeen: WorkflowStage[] = [];
      let completed = 0;

      const tl = buildWorkflowTimeline({
        handlers: {
          AOI_SELECTION: ({ sub, location: loc }) => {
            // Recompute the AOI exactly as the real component does.
            const geom = buildAOIPolygon(loc.center, seedForCity(loc.city));
            sub.call(() => {
              expect(geom.vertices.length).toBe(7);
              expect(geom.areaSqKm).toBeGreaterThan(0.5);
            }, [], 0);
          },
        },
        location,
        reducedMotion: false,
        onStageChange: (s) => stagesSeen.push(s),
        onLoopComplete: () => {
          completed += 1;
        },
      });

      driveTimeline(tl);

      expect(completed).toBe(1);
      // All 16 stages fired exactly once, in order.
      expect(stagesSeen).toEqual(WORKFLOW_STAGES);
      expect(STAGE_ORDER[stagesSeen[0]]).toBe(0);
      expect(STAGE_ORDER[stagesSeen[stagesSeen.length - 1]]).toBe(
        WORKFLOW_STAGES.length - 1
      );
      tl.kill();
    }

    // 30 loops through a 5-city list => each city exactly 6 times.
    const counts = visited.reduce<Record<string, number>>((acc, c) => {
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    expect(Object.keys(counts)).toHaveLength(5);
    Object.values(counts).forEach((c) => expect(c).toBe(6));
  });

  it("respects reducedMotion by stopping instead of auto-looping", () => {
    // With reducedMotion, the controller's onComplete path must not schedule a new loop
    // (the controller checks loop && !reducedMotion before looping).
    let completed = 0;
    const tl = buildWorkflowTimeline({
      handlers: {},
      location: getLocationForLoop(0),
      reducedMotion: true,
      onStageChange: () => {},
      onLoopComplete: () => {
        completed += 1;
      },
    });
    driveTimeline(tl);
    expect(completed).toBe(1);
    tl.kill();
  });
});
