import { isDemAvailable } from "@/lib/demFile";

export const dynamic = "force-dynamic";

/**
 * Probes whether the India DEM file is present on this server so the explore map can
 * fail gracefully (stay on the current base layer) instead of entering Terrain mode
 * and flooding the console with 500 tile errors that break the style.
 */
export async function GET() {
  return Response.json({ available: isDemAvailable() });
}
