import { fetchGbaGeoJSON, gbaErrorResponse, gbaJsonResponse } from "../_gba";

// Level 2: all 5 GBA corporations (Central, East, North, South, West) in one file -
// there's no further filtering needed since the authority has exactly one set of them.
export async function GET() {
  try {
    const collection = await fetchGbaGeoJSON("corporations");
    return gbaJsonResponse(collection);
  } catch (error) {
    console.error("Error fetching GBA corporations:", error);
    return gbaErrorResponse(error instanceof Error ? error.message : "Failed to load GBA corporations");
  }
}
