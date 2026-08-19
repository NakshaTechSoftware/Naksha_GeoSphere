import { NextRequest, NextResponse } from "next/server";

// Turn-by-turn directions (Karnataka only), backed by self-hosted OSRM instances (see
// infrastructure/routing/) - one per travel mode, since OSRM serves exactly one profile per
// running instance rather than accepting a mode flag on a shared one. Proxied server-side
// rather than called directly from the browser, consistent with /api/geocode and the MinIO
// dataset routes - keeps the internal service addresses (the osrm-driving/-walking/-cycling
// Compose services, reachable at http://osrm-<mode>:5000 from this container's network) out
// of client code, and gives us one place to adjust if OSRM ever moves to a real app-compute
// server.
const OSRM_URLS: Record<string, string> = {
  driving: "http://osrm-driving:5000",
  walking: "http://osrm-walking:5000",
  cycling: "http://osrm-cycling:5000",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = params.get("start"); // "lon,lat"
  const end = params.get("end"); // "lon,lat"
  const mode = params.get("mode") ?? "driving";
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required (lon,lat)" }, { status: 400 });
  }
  const osrmUrl = OSRM_URLS[mode];
  if (!osrmUrl) {
    return NextResponse.json({ error: `Unknown mode "${mode}"` }, { status: 400 });
  }

  try {
    const osrmParams = new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: "true",
      // Up to 3 route options, same as Google's directions list - OSRM decides how many
      // genuinely distinct alternatives exist (often just 1 on a simple/rural trip).
      alternatives: "3",
    });
    const response = await fetch(
      `${osrmUrl}/route/v1/${mode}/${start};${end}?${osrmParams.toString()}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const data = await response.json();
    if (data.code !== "Ok") {
      return NextResponse.json({ error: data.message ?? data.code ?? "No route found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Routing request failed:", error);
    return NextResponse.json({ error: "Routing service unavailable" }, { status: 502 });
  }
}
