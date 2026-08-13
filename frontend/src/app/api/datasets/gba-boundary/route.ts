import { fetchGbaGeoJSON, gbaErrorResponse, gbaJsonResponse } from "../_gba";

// Level 1: the single overall GBA (Greater Bengaluru Authority) boundary.
export async function GET() {
  try {
    const collection = await fetchGbaGeoJSON("boundary");
    return gbaJsonResponse(collection);
  } catch (error) {
    console.error("Error fetching GBA authority boundary:", error);
    return gbaErrorResponse(error instanceof Error ? error.message : "Failed to load GBA boundary");
  }
}
