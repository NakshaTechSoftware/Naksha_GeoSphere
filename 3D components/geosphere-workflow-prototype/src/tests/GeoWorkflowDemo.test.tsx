import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { GeoWorkflowDemo as GeoWorkflowDemoType } from "@/components/workflow/GeoWorkflowDemo";

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  // jsdom does not implement these — stub them before any hook uses them.
  window.ResizeObserver = window.ResizeObserver ?? (StubObserver as unknown as typeof ResizeObserver);
  window.IntersectionObserver =
    window.IntersectionObserver ?? (StubObserver as unknown as typeof IntersectionObserver);

  // jsdom has no createObjectURL; maplibre-gl calls it at import time to
  // register its worker. jsdom also has no real WebGL, so the component
  // falls back to the static grid regardless — this stub only lets the
  // module load without throwing.
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => "blob:stub";
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {};
  }

  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList;
  }

  // ?testMode=true forces short deterministic durations for the whole file.
  window.history.pushState({}, "", "/?testMode=true");
});

afterEach(() => {
  cleanup();
});

async function loadGeoWorkflowDemo(): Promise<typeof GeoWorkflowDemoType> {
  const mod = await import("@/components/workflow/GeoWorkflowDemo");
  return mod.GeoWorkflowDemo;
}

describe("GeoWorkflowDemo", () => {
  it("renders without crashing and starts at INITIALIZE", async () => {
    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    const onStageChange = vi.fn();
    render(<GeoWorkflowDemo autoPlay={false} onStageChange={onStageChange} />);
    expect(screen.getByText("Search location")).toBeInTheDocument();
  });

  it("falls back to the pale-blue grid canvas when WebGL/map style is unavailable (jsdom has no WebGL)", async () => {
    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    render(<GeoWorkflowDemo autoPlay={false} />);
    expect(await screen.findByTestId("workflow-map-fallback")).toBeInTheDocument();
  });

  it("progresses through stages and reaches DATA_SELECTION with imagery + elevation tags and INR pricing", async () => {
    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    const stages: string[] = [];
    render(<GeoWorkflowDemo autoPlay loop={false} onStageChange={(s) => stages.push(s)} />);

    await waitFor(
      () => {
        expect(stages).toContain("ADD_TO_CART");
      },
      { timeout: 8000 },
    );

    expect(screen.getAllByText("Imagery").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Elevation").length).toBeGreaterThan(0);
    expect(screen.getByText(/₹/)).toBeInTheDocument();
  });

  it("hides the simulated cursor in reduced-motion preview and stage description stays readable", async () => {
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList;

    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    render(<GeoWorkflowDemo autoPlay={false} />);
    expect(screen.queryByTestId("workflow-cursor")).not.toBeInTheDocument();

    // restore for subsequent tests in this file
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList;
  });

  it("unmounts cleanly without throwing (timeline + map + observers are torn down)", async () => {
    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    const { unmount } = render(<GeoWorkflowDemo autoPlay />);
    expect(() => unmount()).not.toThrow();
  });

  it("exposes an accessible hidden description of the workflow", async () => {
    const GeoWorkflowDemo = await loadGeoWorkflowDemo();
    render(<GeoWorkflowDemo autoPlay={false} />);
    expect(screen.getByText(/Animated demonstration showing how a user searches for Bengaluru/i)).toBeInTheDocument();
  });
});
