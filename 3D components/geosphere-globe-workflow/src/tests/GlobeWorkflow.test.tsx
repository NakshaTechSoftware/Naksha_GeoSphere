import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlobeWorkflow } from "../components/GlobeWorkflow/GlobeWorkflow";

// MapLibre cannot run in jsdom; mock the module so the component renders and the
// workflow state machine still drives the DOM overlays.
vi.mock("maplibre-gl", () => {
  const noop = () => {};
  class MockMap {
    on = vi.fn(noop);
    off = vi.fn(noop);
    remove = vi.fn(noop);
    addControl = vi.fn(noop);
    flyTo = vi.fn(noop);
    easeTo = vi.fn(noop);
    setProjection = vi.fn(noop);
    getSource = vi.fn(() => null);
    addSource = vi.fn(noop);
    getLayer = vi.fn(() => null);
    addLayer = vi.fn(noop);
    setLayoutProperty = vi.fn(noop);
    setPaintProperty = vi.fn(noop);
    isStyleLoaded = vi.fn(() => true);
    getStyle = vi.fn(() => ({ sources: {} }));
  }
  return {
    default: { Map: MockMap, NavigationControl: class {} },
    Map: MockMap,
    NavigationControl: class {},
  };
});

// fetch for geodata in jsdom.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ type: "FeatureCollection", features: [] }),
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GlobeWorkflow", () => {
  it("renders the workflow component with the map canvas and overlays", () => {
    render(
      <GlobeWorkflow
        autoPlay={false}
        loop={false}
        showPrototypeControls={false}
      />
    );
    expect(screen.getByTestId("globe-workflow")).toBeInTheDocument();
    // Initial stage is BOOT.
    expect(
      screen.getByTestId("globe-workflow").getAttribute("data-workflow-stage")
    ).toBe("BOOT");
  });

  it("supports autoPlay false without crashing", () => {
    const { rerender } = render(
      <GlobeWorkflow autoPlay={false} loop={false} />
    );
    expect(() =>
      rerender(<GlobeWorkflow autoPlay={false} loop={false} playbackRate={2} />)
    ).not.toThrow();
  });
});
