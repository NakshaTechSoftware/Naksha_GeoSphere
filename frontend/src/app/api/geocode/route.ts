import { NextRequest, NextResponse } from "next/server";

// Free-text place/address search (the "Google-style" search box results), backed by OSM
// Nominatim's public API. There's no API key/billing involved - Nominatim's usage policy
// caps this at ~1 request/sec and requires a real identifying User-Agent (an unset or
// generic one gets blocked), so this route: (1) sets that header server-side rather than
// trusting the browser to, (2) debounces on the client (see ExplorePage.tsx) so keystrokes
// don't hammer it, and (3) caches identical queries briefly in-memory to cut down on repeat
// lookups (e.g. re-focusing the search box re-fetches the same query).
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "NakshaGeoSphere/1.0 (software.team@nakshatech.com)";
const CACHE_TTL_MS = 5 * 60 * 1000;

type GeocodeResult = { label: string; lat: number; lon: number };
type ReverseResult = { label: string | null; shortName: string | null };

const cache = new Map<string, { at: number; results: GeocodeResult[] }>();
const reverseCache = new Map<string, { at: number; result: ReverseResult }>();

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");
  if (lat !== null && lon !== null) return handleReverse(lat, lon);

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json([]);

  const cached = cache.get(q);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.results);
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q,
      countrycodes: "in",
      addressdetails: "0",
      limit: "6",
    });
    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) return NextResponse.json([], { status: 502 });

    const data = (await response.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;
    const results: GeocodeResult[] = data.map((item) => ({
      label: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
    }));

    cache.set(q, { at: Date.now(), results });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Geocode lookup failed:", error);
    return NextResponse.json([], { status: 500 });
  }
}

// Reverse geocoding (lat/lon -> a human-readable place name/address) for the "Find My Way"
// place-click card - same free Nominatim endpoint as the text search above, just its
// "/reverse" sibling. Cached per rounded coordinate so re-clicking near the same spot (or
// a click that lands on the exact same point twice) doesn't re-hit Nominatim.
async function handleReverse(latParam: string, lonParam: string) {
  const lat = parseFloat(latParam);
  const lon = parseFloat(lonParam);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ label: null, shortName: null }, { status: 400 });
  }

  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.result);
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lon),
      zoom: "18",
      addressdetails: "1",
    });
    const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      return NextResponse.json({ label: null, shortName: null }, { status: 502 });
    }

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const label = data.display_name ?? null;
    // A short, "one place name" label for the map's on-click marker (Google shows just the
    // place name there, not the full address) - the most specific named settlement Nominatim
    // knows for this point, falling back to the first segment of the full address.
    const address = data.address ?? {};
    const shortName =
      address.city ??
      address.town ??
      address.village ??
      address.suburb ??
      address.county ??
      label?.split(",")[0]?.trim() ??
      null;
    const result: ReverseResult = { label, shortName };
    reverseCache.set(key, { at: Date.now(), result });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reverse geocode lookup failed:", error);
    return NextResponse.json({ label: null, shortName: null }, { status: 500 });
  }
}
