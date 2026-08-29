/**
 * Overpass API utility for fetching nearby Points of Interest (POIs).
 *
 * This queries the OpenStreetMap Overpass API to find places near a clicked point,
 * similar to how Google Maps shows place information when you click on a location.
 *
 * https://wiki.openstreetmap.org/wiki/Overpass_API
 */

export interface OverpassPOI {
  id: number;
  name: string;
  type: string; // amenity, shop, tourism, etc.
  category: string; // specific value like "restaurant", "hospital", etc.
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface OverpassResult {
  places: OverpassPOI[];
  query: string;
}

/**
 * Build an Overpass QL query to find nearby POIs.
 * Searches for nodes and ways with name tags within the given radius.
 */
function buildOverpassQuery(lat: number, lon: number, radiusMeters: number): string {
  // Escape single quotes in category values (shouldn't be needed but safety first)
  return `
[out:json][timeout:10];
(
  node["name"]["amenity"](around:${radiusMeters},${lat},${lon});
  node["name"]["shop"](around:${radiusMeters},${lat},${lon});
  node["name"]["tourism"](around:${radiusMeters},${lat},${lon});
  node["name"]["leisure"](around:${radiusMeters},${lat},${lon});
  node["name"]["historic"](around:${radiusMeters},${lat},${lon});
  node["name"]["craft"](around:${radiusMeters},${lat},${lon});
  node["name"]["office"](around:${radiusMeters},${lat},${lon});
  node["name"]["building"](around:${radiusMeters},${lat},${lon});
  way["name"]["amenity"](around:${radiusMeters},${lat},${lon});
  way["name"]["shop"](around:${radiusMeters},${lat},${lon});
  way["name"]["tourism"](around:${radiusMeters},${lat},${lon});
  way["name"]["leisure"](around:${radiusMeters},${lat},${lon});
  way["name"]["historic"](around:${radiusMeters},${lat},${lon});
  way["name"]["craft"](around:${radiusMeters},${lat},${lon});
  way["name"]["office"](around:${radiusMeters},${lat},${lon});
  way["name"]["building"](around:${radiusMeters},${lat},${lon});
);
out center body;
`;
}

/**
 * Parse Overpass response into normalized POI objects.
 */
function parseOverpassResponse(data: unknown): OverpassPOI[] {
  const result = data as { elements?: Array<Record<string, unknown>> };
  if (!result.elements) return [];

  const places: OverpassPOI[] = [];

  for (const element of result.elements) {
    const tags = (element.tags ?? {}) as Record<string, string>;
    const name = tags.name;
    if (!name) continue;

    // Determine the primary category type and value
    let type = "place";
    let category = "unknown";

    const categoryTags = [
      "amenity",
      "shop",
      "tourism",
      "leisure",
      "historic",
      "craft",
      "office",
      "building",
    ];

    for (const tag of categoryTags) {
      if (tags[tag]) {
        type = tag;
        category = tags[tag];
        break;
      }
    }

    // Get coordinates - for nodes use lat/lon, for ways use center
    let lat: number;
    let lon: number;

    if (element.type === "node") {
      lat = element.lat as number;
      lon = element.lon as number;
    } else if (element.center) {
      lat = (element.center as { lat: number }).lat;
      lon = (element.center as { lon: number }).lon;
    } else {
      continue; // Skip elements without coordinates
    }

    places.push({
      id: element.id as number,
      name,
      type,
      category,
      lat,
      lon,
      tags,
    });
  }

  return places;
}

/**
 * Calculate distance between two points using Haversine formula.
 * Returns distance in meters.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format a category tag value into a human-readable label.
 */
export function formatCategory(type: string, category: string): string {
  const categoryLabels: Record<string, Record<string, string>> = {
    amenity: {
      restaurant: "Restaurant",
      cafe: "Cafe",
      bar: "Bar",
      pub: "Pub",
      fast_food: "Fast Food",
      school: "School",
      university: "University",
      college: "College",
      hospital: "Hospital",
      clinic: "Clinic",
      pharmacy: "Pharmacy",
      bank: "Bank",
      atm: "ATM",
      cinema: "Cinema",
      theatre: "Theatre",
      library: "Library",
      fuel: "Fuel Station",
      parking: "Parking",
      hotel: "Hotel",
      motel: "Motel",
      police: "Police Station",
      fire_station: "Fire Station",
      post_office: "Post Office",
      courthouse: "Courthouse",
      townhall: "Town Hall",
      place_of_worship: "Place of Worship",
      temple: "Temple",
      mosque: "Mosque",
      church: "Church",
      gurdwara: "Gurdwara",
      events_venue: "Events Venue",
      community_centre: "Community Centre",
      social_facility: "Social Facility",
      shelter: "Shelter",
      drinking_water: "Drinking Water",
      toilet: "Toilet",
      bench: "Bench",
      waste_basket: "Waste Basket",
    },
    shop: {
      supermarket: "Supermarket",
      convenience: "Convenience Store",
      department_store: "Department Store",
      clothes: "Clothing Store",
      shoes: "Shoe Store",
      electronics: "Electronics Store",
      furniture: "Furniture Store",
      hardware: "Hardware Store",
      bakery: "Bakery",
      butcher: "Butcher",
      deli: "Deli",
      greengrocer: "Greengrocer",
      health_food: "Health Food Store",
      organic: "Organic Store",
      car: "Car Dealer",
      car_repair: "Car Repair",
      bicycle: "Bicycle Shop",
      florist: "Florist",
      gift: "Gift Shop",
      jewelry: "Jewelry Store",
      optician: "Optician",
      pet: "Pet Shop",
      stationery: "Stationery Store",
      toys: "Toy Store",
      books: "Bookstore",
      kiosk: "Kiosk",
      mobile_phone: "Mobile Phone Store",
      computer: "Computer Store",
      sports: "Sports Store",
      outdoor: "Outdoor Store",
      art: "Art Store",
      music: "Music Store",
      video: "Video Store",
      charity: "Charity Shop",
      second_hand: "Second-hand Store",
    },
    tourism: {
      hotel: "Hotel",
      motel: "Motel",
      hostel: "Hostel",
      guest_house: "Guest House",
      apartment: "Apartment",
      camp_site: "Camp Site",
      caravan_site: "Caravan Site",
      information: "Tourist Information",
      museum: "Museum",
      gallery: "Art Gallery",
      attraction: "Tourist Attraction",
      view_point: "Viewpoint",
      artwork: "Artwork",
      theme_park: "Theme Park",
      zoo: "Zoo",
      aquarium: "Aquarium",
      war_memorial: "War Memorial",
      picnic_site: "Picnic Site",
    },
    leisure: {
      park: "Park",
      garden: "Garden",
      nature_reserve: "Nature Reserve",
      sports_centre: "Sports Centre",
      stadium: "Stadium",
      swimming_pool: "Swimming Pool",
      pitch: "Sports Field",
      playground: "Playground",
      dog_park: "Dog Park",
      fitness_centre: "Fitness Centre",
      golf_course: "Golf Course",
      track: "Running Track",
      water_park: "Water Park",
      beach_resort: "Beach Resort",
      marina: "Marina",
      ice_rink: "Ice Rink",
    },
    historic: {
      castle: "Castle",
      fort: "Fort",
      monument: "Monument",
      memorial: "Memorial",
      ruins: "Ruins",
      archaeological_site: "Archaeological Site",
      palace: "Palace",
      temple: "Temple",
      church: "Church",
      mosque: "Mosque",
      synagogue: "Synagogue",
      shrine: "Shrine",
      tomb: "Tomb",
      city_gate: "City Gate",
      city_walls: "City Walls",
      bridge: "Historic Bridge",
      lighthouse: "Lighthouse",
      tower: "Historic Tower",
    },
    craft: {
      tailor: "Tailor",
      jeweller: "Jeweller",
      photographer: "Photographer",
      painter: "Painter",
      carpenter: "Carpenter",
      electrician: "Electrician",
      plumber: "Plumber",
      optician: "Optician",
      confectionery: "Confectionery",
    },
    office: {
      company: "Company Office",
      government: "Government Office",
      lawyer: "Lawyer",
      insurance: "Insurance Office",
      estate_agent: "Estate Agent",
      travel_agent: "Travel Agent",
      ngo: "NGO Office",
    },
    building: {
      commercial: "Commercial Building",
      industrial: "Industrial Building",
      residential: "Residential Building",
      public: "Public Building",
      yes: "Building",
    },
  };

  const labels = categoryLabels[type];
  if (labels && labels[category]) {
    return labels[category];
  }

  // Fallback: capitalize first letter of category
  return category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Fetch nearby POIs from Overpass API.
 *
 * @param lat - Latitude of the center point
 * @param lon - Longitude of the center point
 * @param radiusMeters - Search radius in meters (default: 100)
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Promise resolving to OverpassResult with nearby places
 */
export async function fetchNearbyPOIs(
  lat: number,
  lon: number,
  radiusMeters = 100,
  maxResults = 10
): Promise<OverpassResult> {
  const query = buildOverpassQuery(lat, lon, radiusMeters);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API returned ${response.status}`);
    }

    const data = await response.json();
    const places = parseOverpassResponse(data);

    // Sort by distance from center point and limit results
    const sorted = places
      .map((p) => ({
        ...p,
        distance: haversineDistance(lat, lon, p.lat, p.lon),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults);

    return {
      places: sorted,
      query,
    };
  } catch (error) {
    console.error("Overpass API query failed:", error);
    return { places: [], query };
  }
}
