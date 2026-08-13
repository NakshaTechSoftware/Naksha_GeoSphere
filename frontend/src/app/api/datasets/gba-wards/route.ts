import { NextRequest } from "next/server";
import { fetchGbaGeoJSON, gbaErrorResponse, gbaJsonResponse } from "../_gba";

// Level 4 (leaf): GBA wards, filtered down to one zone's wards via ?corporation=<name>&
// zone=<zone_name> (both case-insensitive) - matches Corporatio + zone_name on each ward
// feature. Omitting both returns all 369 wards; omitting just one filters by the other.
export async function GET(request: NextRequest) {
  try {
    const corporation = request.nextUrl.searchParams.get("corporation")?.trim().toLowerCase();
    const zone = request.nextUrl.searchParams.get("zone")?.trim().toLowerCase();
    const collection = await fetchGbaGeoJSON("wards");

    if (!corporation && !zone) return gbaJsonResponse(collection);

    const features = collection.features.filter((feature) => {
      const props = feature.properties as Record<string, unknown> | null;
      const featureCorporation = typeof props?.["Corporatio"] === "string" ? props["Corporatio"].trim().toLowerCase() : "";
      const featureZone = typeof props?.["zone_name"] === "string" ? props["zone_name"].trim().toLowerCase() : "";
      return (!corporation || featureCorporation === corporation) && (!zone || featureZone === zone);
    });
    return gbaJsonResponse({ type: "FeatureCollection", features });
  } catch (error) {
    console.error("Error fetching GBA wards:", error);
    return gbaErrorResponse(error instanceof Error ? error.message : "Failed to load GBA wards");
  }
}
