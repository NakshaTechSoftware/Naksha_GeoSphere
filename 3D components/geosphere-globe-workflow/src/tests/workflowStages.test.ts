import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STAGES,
  STAGE_ORDER,
  STAGE_GROUP,
  FIRST_STAGE,
  LAST_STAGE,
} from "../animation/workflowStages";
import {
  STAGE_DURATIONS,
  STAGE_START_TIMES,
  TOTAL_LOOP_DURATION,
} from "../animation/workflowDurations";
import {
  WORKFLOW_LOCATIONS,
  getLocationForLoop,
} from "../data/locations";
import { buildAOIPolygon, seedForCity } from "../map/aoiGeometry";
import { formatINR, demoPrice } from "../data/pricing";
import { totalPriceFor, getDataset, DEMO_SELECTION_IDS } from "../data/datasets";
import { exportPackageName, formatAreaKm2 } from "../data/workflowDemo";

describe("workflow stage order", () => {
  it("defines the exact master stage sequence", () => {
    expect(WORKFLOW_STAGES).toEqual([
      "BOOT",
      "GLOBE_INTRO",
      "ROTATE_TO_INDIA",
      "INDIA_FOCUS",
      "KARNATAKA_FOCUS",
      "LOCAL_FLY_IN",
      "LOCAL_MAP_READY",
      "AOI_SELECTION",
      "DATA_DISCOVERY",
      "FORMAT_SELECTION",
      "EXPORT_REQUEST",
      "PAYMENT",
      "SECURE_PROCESSING",
      "EMAIL_DELIVERY",
      "DELIVERY_COMPLETE",
      "RESET",
    ]);
  });

  it("assigns monotonically increasing order indices", () => {
    WORKFLOW_STAGES.forEach((stage, i) => {
      expect(STAGE_ORDER[stage]).toBe(i);
    });
  });

  it("starts at BOOT and ends at RESET", () => {
    expect(FIRST_STAGE).toBe("BOOT");
    expect(LAST_STAGE).toBe("RESET");
  });

  it("covers every stage in the group map", () => {
    WORKFLOW_STAGES.forEach((stage) => {
      expect(STAGE_GROUP[stage]).toBeTruthy();
    });
  });
});

describe("workflow durations", () => {
  it("total loop is within the 28-34s target (~31s)", () => {
    expect(TOTAL_LOOP_DURATION).toBeGreaterThanOrEqual(28);
    expect(TOTAL_LOOP_DURATION).toBeLessThanOrEqual(34);
    // 32s total: BOOT + LOCAL_MAP_READY add 1.4s on top of the 30-32s reference table.
    expect(TOTAL_LOOP_DURATION).toBeGreaterThanOrEqual(30);
  });

  it("every stage has a positive duration", () => {
    WORKFLOW_STAGES.forEach((stage) => {
      expect(STAGE_DURATIONS[stage]).toBeGreaterThan(0);
    });
  });

  it("stage start times are contiguous and sum to the total", () => {
    let t = 0;
    WORKFLOW_STAGES.forEach((stage) => {
      expect(STAGE_START_TIMES[stage]).toBeCloseTo(t, 5);
      t += STAGE_DURATIONS[stage];
    });
    expect(t).toBeCloseTo(TOTAL_LOOP_DURATION, 5);
  });

  it("BOOT starts at 0", () => {
    expect(STAGE_START_TIMES.BOOT).toBe(0);
  });
});

describe("location rotation", () => {
  it("rotates deterministically through the 5 real cities", () => {
    const names = WORKFLOW_LOCATIONS.map((l) => l.city);
    expect(names).toEqual([
      "Bengaluru",
      "Mysuru",
      "Chikkamagaluru",
      "Mangaluru",
      "Hubballi-Dharwad",
    ]);
    // Loop 0 -> Bengaluru, loop 4 -> Hubballi-Dharwad, loop 5 -> Bengaluru again.
    expect(getLocationForLoop(0).city).toBe("Bengaluru");
    expect(getLocationForLoop(4).city).toBe("Hubballi-Dharwad");
    expect(getLocationForLoop(5).city).toBe("Bengaluru");
  });

  it("handles negative loop indices without throwing", () => {
    expect(() => getLocationForLoop(-3)).not.toThrow();
    expect(getLocationForLoop(-1).city).toBe(getLocationForLoop(4).city);
  });

  it("every location has real, distinct coordinates in Karnataka", () => {
    const seen = new Set<string>();
    WORKFLOW_LOCATIONS.forEach((l) => {
      expect(l.state).toBe("Karnataka");
      expect(l.country).toBe("India");
      expect(l.center).toHaveLength(2);
      // Karnataka bounding box: lng 74.10-78.61, lat 11.58-18.43
      expect(l.center[0]).toBeGreaterThan(74.0);
      expect(l.center[0]).toBeLessThan(78.7);
      expect(l.center[1]).toBeGreaterThan(11.5);
      expect(l.center[1]).toBeLessThan(18.5);
      seen.add(l.center.join(","));
    });
    expect(seen.size).toBe(WORKFLOW_LOCATIONS.length);
  });
});

describe("AOI geometry", () => {
  it("is deterministic per city (stable across loops)", () => {
    const a1 = buildAOIPolygon([77.5946, 12.9716], seedForCity("Bengaluru"));
    const a2 = buildAOIPolygon([77.5946, 12.9716], seedForCity("Bengaluru"));
    expect(a1.vertices).toEqual(a2.vertices);
    expect(a1.areaSqKm).toBeCloseTo(a2.areaSqKm, 6);
  });

  it("produces an irregular polygon (not a square / regular hexagon)", () => {
    const aoi = buildAOIPolygon([77.5946, 12.9716], seedForCity("Bengaluru"));
    // 7 vertices + closing point.
    expect(aoi.vertices.length).toBe(7);
    // Irregular: vertex radii (distance from centroid) must differ.
    const c = aoi.centroid;
    const radii = aoi.vertices.map(([x, y]) => Math.hypot(x - c[0], y - c[1]));
    const distinct = new Set(radii.map((r) => r.toFixed(4)));
    expect(distinct.size).toBeGreaterThan(3);
  });

  it("computes a moderate urban area (~1-12 km²)", () => {
    WORKFLOW_LOCATIONS.forEach((l) => {
      const aoi = buildAOIPolygon(l.center, seedForCity(l.city));
      expect(aoi.areaSqKm).toBeGreaterThan(0.5);
      expect(aoi.areaSqKm).toBeLessThan(15);
    });
  });

  it("bounds and centroid lie near the city centre", () => {
    const aoi = buildAOIPolygon([77.5946, 12.9716], seedForCity("Bengaluru"));
    const [w, s, e, n] = aoi.bounds;
    expect(w).toBeLessThan(aoi.centroid[0]);
    expect(e).toBeGreaterThan(aoi.centroid[0]);
    expect(s).toBeLessThan(aoi.centroid[1]);
    expect(n).toBeGreaterThan(aoi.centroid[1]);
  });
});

describe("pricing (INR only)", () => {
  it("formats with the en-IN locale and INR symbol", () => {
    expect(formatINR(1249)).toBe("₹1,249");
    expect(formatINR(999)).toBe("₹999");
  });

  it("demo price matches catalogue totals for imagery + kml", () => {
    expect(demoPrice(["imagery", "kml"])).toBe(999 + 250);
    expect(totalPriceFor(["imagery", "kml"])).toBe(1249);
  });

  it("demo selection resolves through the catalogue", () => {
    const names = DEMO_SELECTION_IDS.map((id) => getDataset(id).name);
    expect(names).toContain("Premium Imagery");
    expect(names).toContain("KML / KMZ");
  });
});

describe("workflow demo helpers", () => {
  it("builds a slug package name per city", () => {
    expect(exportPackageName("Bengaluru")).toBe("Bengaluru_AOI");
    expect(exportPackageName("Hubballi-Dharwad")).toBe("Hubballi_Dharwad_AOI");
  });

  it("formats area sensibly", () => {
    expect(formatAreaKm2(12.4512)).toBe("12.5");
    expect(formatAreaKm2(3.21)).toBe("3.21");
    expect(formatAreaKm2(120)).toBe("120");
  });
});
