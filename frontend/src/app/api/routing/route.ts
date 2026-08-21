import { NextRequest, NextResponse } from "next/server";

// Turn-by-turn directions (Karnataka only), backed by self-hosted OSRM instances (see
// infrastructure/routing/) - one per travel mode, since OSRM serves exactly one profile per
// running instance rather than accepting a mode flag on a shared one. Proxied server-side
// rather than called directly from the browser, consistent with /api/geocode and the MinIO
// dataset routes - keeps the internal service addresses (the osrm-driving/-walking/-cycling
// Compose services, reachable at http://osrm-<mode>:5000 from this container's network) out
// of client code, and gives us one place to adjust if OSRM ever moves to a real app-compute
// server.
// NODE_ENV alone can't tell "running inside the Compose network" apart from "running as a
// bare host process" - compose.dev.yaml runs `next dev` (NODE_ENV=development) *inside* the
// web container, where "localhost" means the container itself, not the host, so an
// env-only check picks the wrong URL there. Try the Compose service hostname first (correct
// whenever this is running in any Docker Compose setup, dev or prod) and fall back to the
// host-mapped port only if that's unreachable (bare `npm run dev` outside Docker).
const OSRM_HOSTS: Record<string, { docker: string; local: string }> = {
  driving: { docker: "http://osrm-driving:5000", local: "http://localhost:5001" },
  walking: { docker: "http://osrm-walking:5000", local: "http://localhost:5002" },
  cycling: { docker: "http://osrm-cycling:5000", local: "http://localhost:5003" },
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const start = params.get("start"); // "lon,lat"
  const end = params.get("end"); // "lon,lat"
  const mode = params.get("mode") ?? "driving";
  if (!start || !end) {
    return NextResponse.json({ error: "start and end are required (lon,lat)" }, { status: 400 });
  }
  const hosts = OSRM_HOSTS[mode];
  if (!hosts) {
    return NextResponse.json({ error: `Unknown mode "${mode}"` }, { status: 400 });
  }

  const osrmParams = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    steps: "true",
    // Up to 3 route options, same as Google's directions list - OSRM decides how many
    // genuinely distinct alternatives exist (often just 1 on a simple/rural trip).
    alternatives: "3",
  });
  const path = `/route/v1/${mode}/${start};${end}?${osrmParams.toString()}`;

  for (const osrmUrl of [hosts.docker, hosts.local]) {
    try {
      const response = await fetch(`${osrmUrl}${path}`, { signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (data.code !== "Ok") {
        return NextResponse.json(
          { error: data.message ?? data.code ?? "No route found" },
          { status: 404 }
        );
      }
      return NextResponse.json(data);
    } catch (error) {
      // A connection-level failure (DNS/ECONNREFUSED - this host isn't reachable from here)
      // falls through to try the other host. Any other error (timeout, bad JSON) is the real
      // failure and shouldn't mask itself as "try the next URL".
      if (osrmUrl === hosts.local) {
        console.error("Routing request failed:", error);
        return NextResponse.json({ error: "Routing service unavailable" }, { status: 502 });
      }
    }
  }
  return NextResponse.json({ error: "Routing service unavailable" }, { status: 502 });
}
