// Deterministic rotating list of real Karnataka locations used by the looping workflow.
// Coordinates verified against standard geographic references (city centroids / municipal
// extents; see GEODATA_SOURCES.md). Never randomized.

export interface WorkflowLocation {
  city: string;
  state: string;
  country: string;
  /** City-center [longitude, latitude] used as the fly-to target. */
  center: [number, number];
  /** Camera bearing (deg) for a slightly varied but stable local perspective. */
  bearing: number;
  /** Human-readable label used in the search bar. */
  label: string;
}

export const WORKFLOW_LOCATIONS: WorkflowLocation[] = [
  {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    center: [77.5946, 12.9716],
    bearing: -12,
    label: "Bengaluru, Karnataka",
  },
  {
    city: "Mysuru",
    state: "Karnataka",
    country: "India",
    center: [76.6394, 12.2958],
    bearing: 6,
    label: "Mysuru, Karnataka",
  },
  {
    city: "Chikkamagaluru",
    state: "Karnataka",
    country: "India",
    center: [75.7705, 13.3161],
    bearing: -4,
    label: "Chikkamagaluru, Karnataka",
  },
  {
    city: "Mangaluru",
    state: "Karnataka",
    country: "India",
    center: [74.8562, 12.9141],
    bearing: 10,
    label: "Mangaluru, Karnataka",
  },
  {
    city: "Hubballi-Dharwad",
    state: "Karnataka",
    country: "India",
    center: [75.1239, 15.3647],
    bearing: -8,
    label: "Hubballi-Dharwad, Karnataka",
  },
];

/** Returns the location for a loop index, rotating deterministically. */
export function getLocationForLoop(loopIndex: number): WorkflowLocation {
  const idx = ((loopIndex % WORKFLOW_LOCATIONS.length) + WORKFLOW_LOCATIONS.length) % WORKFLOW_LOCATIONS.length;
  return WORKFLOW_LOCATIONS[idx]!;
}

/** Returns the location at a fixed slot (used by prototype location selector). */
export function getLocationAt(slot: number): WorkflowLocation {
  return WORKFLOW_LOCATIONS[slot % WORKFLOW_LOCATIONS.length]!;
}
