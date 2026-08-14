import { NextRequest } from "next/server";
import { fetchGbaGeoJSON, gbaErrorResponse, gbaJsonResponse } from "../_gba";

// Level 3: GBA zones, filtered down to one corporation's zones via ?corporation=<name>
// (case-insensitive) - matches Corporatio on each zone feature, the corporation each zone
// belongs to. Omit the param to get all 10 zones across every corporation.
export async function GET(request: NextRequest) {
  try {
    const corporation = request.nextUrl.searchParams.get("corporation")?.trim().toLowerCase();
    const collection = await fetchGbaGeoJSON("zones");

    if (!corporation) return gbaJsonResponse(collection);

    const features = collection.features.filter((feature) => {
      const value = (feature.properties as Record<string, unknown> | null)?.["Corporatio"];
      return typeof value === "string" && value.trim().toLowerCase() === corporation;
    });
    return gbaJsonResponse({ type: "FeatureCollection", features });
  } catch (error) {
    console.error("Error fetching GBA zones:", error);
    return gbaErrorResponse(error instanceof Error ? error.message : "Failed to load GBA zones");
  }
}
