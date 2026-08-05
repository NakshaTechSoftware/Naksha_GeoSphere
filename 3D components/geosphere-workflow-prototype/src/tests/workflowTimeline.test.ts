import { describe, expect, it } from "vitest";
import { buildWorkflowTimeline, type WorkflowTimelineHandlers } from "@/animation/workflowTimeline";
import { WORKFLOW_STAGES, FIRST_STAGE, LAST_STAGE } from "@/animation/workflowStages";
import { STAGE_TIMES, TEST_MODE_SPEED_MULTIPLIER } from "@/animation/workflowDurations";

function buildWithSpies(overrides: Partial<{ reducedMotion: boolean; loop: boolean }> = {}) {
  const stagesEntered: string[] = [];
  const cursorMoves: number[] = [];
  const datasetSelections: Array<[string, boolean]> = [];
  const cartBadges: number[] = [];

  const handlers: WorkflowTimelineHandlers = {
    onStageEnter: (stage) => stagesEntered.push(stage),
    onCursorMove: () => cursorMoves.push(1),
    onDatasetSelected: (id, selected) => datasetSelections.push([id, selected]),
    onCartBadge: (count) => cartBadges.push(count),
  };

  const timeline = buildWorkflowTimeline(handlers, {
    reducedMotion: overrides.reducedMotion ?? false,
    testMode: true,
    loop: overrides.loop ?? false,
    playbackRate: 1,
  });

  return { timeline, stagesEntered, cursorMoves, datasetSelections, cartBadges };
}

describe("workflow stage order", () => {
  it("is exactly the approved 12-stage sequence, starting at INITIALIZE", () => {
    expect(WORKFLOW_STAGES).toEqual([
      "INITIALIZE",
      "MAP_BUILD",
      "SEARCH",
      "CAMERA_FLY",
      "AOI_DRAW",
      "DATA_DISCOVERY",
      "DATA_SELECTION",
      "ADD_TO_CART",
      "SECURE_PROCESSING",
      "PURCHASE_COMPLETE",
      "DOWNLOAD_READY",
      "RESET",
    ]);
    expect(FIRST_STAGE).toBe("INITIALIZE");
    expect(LAST_STAGE).toBe("RESET");
  });
});

describe("buildWorkflowTimeline", () => {
  it("starts in INITIALIZE when seeked to the very start", () => {
    const { timeline, stagesEntered } = buildWithSpies();
    // A hair past zero so the playhead actually crosses the INITIALIZE
    // label (seeking to exactly 0, its own position, fires no callback).
    timeline.seek(0.0001, false);
    expect(stagesEntered[0]).toBe("INITIALIZE");
    timeline.kill();
  });

  it("enters every stage exactly once, in order, across one full pass", () => {
    const { timeline, stagesEntered } = buildWithSpies();
    const fullDuration = STAGE_TIMES.RESET.end / TEST_MODE_SPEED_MULTIPLIER;
    timeline.seek(fullDuration, false);
    expect(stagesEntered).toEqual(WORKFLOW_STAGES);
    timeline.kill();
  });

  it("does not repeat when loop is off", () => {
    const { timeline } = buildWithSpies({ loop: false });
    expect(timeline.repeat()).toBe(0);
    timeline.kill();
  });

  it("repeats indefinitely when loop is on", () => {
    const { timeline } = buildWithSpies({ loop: true });
    expect(timeline.repeat()).toBe(-1);
    timeline.kill();
  });

  it("respects reduced motion by never moving the simulated cursor", () => {
    const { timeline, cursorMoves } = buildWithSpies({ reducedMotion: true });
    const fullDuration = STAGE_TIMES.RESET.end / TEST_MODE_SPEED_MULTIPLIER;
    timeline.seek(fullDuration, false);
    expect(cursorMoves.length).toBe(0);
    timeline.kill();
  });

  it("moves the simulated cursor when motion is not reduced", () => {
    const { timeline, cursorMoves } = buildWithSpies({ reducedMotion: false });
    const fullDuration = STAGE_TIMES.RESET.end / TEST_MODE_SPEED_MULTIPLIER;
    timeline.seek(fullDuration, false);
    expect(cursorMoves.length).toBeGreaterThan(0);
    timeline.kill();
  });

  it("selects imagery then elevation during DATA_SELECTION", () => {
    const { timeline, datasetSelections } = buildWithSpies();
    timeline.seek(STAGE_TIMES.DATA_SELECTION.end / TEST_MODE_SPEED_MULTIPLIER, false);
    expect(datasetSelections).toContainEqual(["imagery", true]);
    expect(datasetSelections).toContainEqual(["elevation", true]);
    timeline.kill();
  });

  it("sets the cart badge to 2 during ADD_TO_CART", () => {
    const { timeline, cartBadges } = buildWithSpies();
    timeline.seek(STAGE_TIMES.ADD_TO_CART.end / TEST_MODE_SPEED_MULTIPLIER, false);
    expect(cartBadges).toContain(2);
    timeline.kill();
  });

  it("returns the cart badge to 0 after RESET", () => {
    const { timeline, cartBadges } = buildWithSpies();
    const fullDuration = STAGE_TIMES.RESET.end / TEST_MODE_SPEED_MULTIPLIER;
    timeline.seek(fullDuration, false);
    expect(cartBadges[cartBadges.length - 1]).toBe(0);
    timeline.kill();
  });
});
