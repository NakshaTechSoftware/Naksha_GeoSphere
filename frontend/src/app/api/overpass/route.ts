import { NextRequest, NextResponse } from "next/server";

const cache = new Map<string, { at: number; result: POI[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_AGENT = "NakshaGeoSphere/1.0 (software.team@nakshatech.com)";

interface POI {
  id: number;
  name: string;
  type: string;
  category: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

// Common POI search terms to find nearby places
const POI_SEARCH_TERMS = [
  "restaurant", "cafe", "hospital", "school", "hotel",
  "bank", "pharmacy", "supermarket", "park", "temple",
  "church", "mosque", "fuel station", "police", "post office",
  "gym", "salon", "dentist", "atm", "parking",
];

function formatCategory(cls: string, type: string): string {
  const labels: Record<string, string> = {
    restaurant: "Restaurant", cafe: "Cafe", bar: "Bar", pub: "Pub",
    fast_food: "Fast Food", school: "School", university: "University",
    hospital: "Hospital", clinic: "Clinic", pharmacy: "Pharmacy",
    bank: "Bank", atm: "ATM", cinema: "Cinema", fuel: "Fuel Station",
    police: "Police", fire_station: "Fire Station", place_of_worship: "Place of Worship",
    supermarket: "Supermarket", convenience: "Convenience Store",
    hotel: "Hotel", hostel: "Hostel",
    museum: "Museum", attraction: "Attraction", viewpoint: "Viewpoint",
    park: "Park", garden: "Garden", playground: "Playground",
    stadium: "Stadium", sports_centre: "Sports Centre",
    temple: "Temple", church: "Church", mosque: "Mosque",
    marketplace: "Market", parking: "Parking", bus_station: "Bus Station",
    library: "Library", community_centre: "Community Centre",
    post_office: "Post Office",
  };
  return labels[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Search for nearby POIs using Nominatim's search with viewbox bounding box.
 */
async function searchNearbyPOIs(lat: number, lon: number, radiusMeters: number, limit: number): Promise<POI[]> {
  // Convert radius to approximate bounding box degrees
  const deltaLat = radiusMeters / 111320;
  const deltaLon = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const minLon = lon - deltaLon;
  const minLat = lat - deltaLat;
  const maxLon = lon + deltaLon;
  const maxLat = lat + deltaLat;
  const viewbox = `${minLon},${maxLat},${maxLon},${minLat}`;

  const allPOIs: POI[] = [];
  const seen = new Set<string>();

  // Search common POI types in parallel
  const searches = POI_SEARCH_TERMS.map(async (term) => {
    try {
      const params = new URLSearchParams({
        format: "json",
        q: term,
        viewbox,
        bounded: "1",
        limit: "3",
        addressdetails: "0",
      });

      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return [];

      const data = (await res.json()) as Array<{
        osm_id: number;
        lat: string;
        lon: string;
        name?: string;
        class?: string;
        type?: string;
      }>;

      return data
        .filter((item) => item.name && item.osm_id && !seen.has(String(item.osm_id)))
        .map((item) => {
          seen.add(String(item.osm_id));
          const cls = item.class ?? "place";
          const subtype = item.type ?? term;
          return {
            id: item.osm_id,
            name: item.name!,
            type: cls,
            category: subtype,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
            tags: { [cls]: subtype },
          };
        });
    } catch {
      return [];
    }
  });

  const results = await Promise.allSettled(searches);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allPOIs.push(...result.value);
    }
  }

  // Sort by distance from center point
  allPOIs.sort((a, b) => {
    const distA = Math.sqrt((a.lat - lat) ** 2 + (a.lon - lon) ** 2);
    const distB = Math.sqrt((b.lat - lat) ** 2 + (b.lon - lon) ** 2);
    return distA - distB;
  });

  return allPOIs.slice(0, limit);
}

export async function GET(request: NextRequest) {
  const latStr = request.nextUrl.searchParams.get("lat");
  const lonStr = request.nextUrl.searchParams.get("lon");
  const radiusStr = request.nextUrl.searchParams.get("radius");
  const limitStr = request.nextUrl.searchParams.get("limit");

  if (!latStr || !lonStr) {
    return NextResponse.json({ error: "lat and lon required" }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const radius = Math.min(Math.max(parseInt(radiusStr ?? "400", 10) || 400, 50), 500);
  const limit = Math.min(Math.max(parseInt(limitStr ?? "50", 10) || 50, 1), 50);

  // Cache check
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ places: cached.result.slice(0, limit) });
  }

  try {
    const places = await searchNearbyPOIs(lat, lon, radius, limit);
    cache.set(key, { at: Date.now(), result: places });
    return NextResponse.json({ places });
  } catch (error) {
    console.error("POI search error:", error);
    return NextResponse.json({ places: [] });
  }
}
