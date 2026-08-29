/**
 * Interactive POI (Point of Interest) overlay layer for MapLibre.
 *
 * Fetches nearby places from Overpass API and renders them as interactive
 * text labels on the map. Labels turn blue on hover and show place info on click,
 * similar to Google Maps behavior.
 */

import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";

export interface POI {
  id: number;
  name: string;
  type: string;
  category: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface POILayerOptions {
  /** Minimum zoom level to show POI labels */
  minZoom?: number;
  /** Maximum number of POIs to fetch */
  limit?: number;
  /** Search radius in meters */
  radius?: number;
  /** Debounce interval for viewport changes in ms */
  debounceMs?: number;
}

const SOURCE_ID = "overpass-pois";
const BASE_LAYER_ID = "overpass-pois-labels";
const HOVER_LAYER_ID = "overpass-pois-labels-hover";
const CLICKED_LAYER_ID = "overpass-pois-labels-clicked";

const DEFAULT_OPTIONS: Required<POILayerOptions> = {
  minZoom: 13,
  limit: 50,
  radius: 400,
  debounceMs: 300,
};

/**
 * Format OSM category tag into human-readable label type.
 */
function formatCategory(type: string, category: string): string {
  const labels: Record<string, Record<string, string>> = {
    amenity: {
      restaurant: "Restaurant", cafe: "Cafe", bar: "Bar", pub: "Pub",
      fast_food: "Fast Food", school: "School", university: "University",
      hospital: "Hospital", clinic: "Clinic", pharmacy: "Pharmacy",
      bank: "Bank", cinema: "Cinema", fuel: "Fuel Station",
      police: "Police", place_of_worship: "Place of Worship",
      events_venue: "Events Venue", community_centre: "Community Centre",
    },
    shop: {
      supermarket: "Supermarket", convenience: "Convenience Store",
      clothes: "Clothing Store", electronics: "Electronics Store",
      bakery: "Bakery", mobile_phone: "Phone Store", books: "Bookstore",
    },
    tourism: {
      hotel: "Hotel", museum: "Museum", attraction: "Attraction",
      information: "Tourist Info", viewpoint: "Viewpoint",
    },
    leisure: {
      park: "Park", garden: "Garden", sports_centre: "Sports Centre",
      stadium: "Stadium", playground: "Playground",
    },
    historic: {
      castle: "Castle", monument: "Monument", memorial: "Memorial",
      ruins: "Ruins", palace: "Palace", temple: "Temple",
    },
  };
  const found = labels[type]?.[category];
  return found ?? category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Build Overpass QL query for POIs near a point.
 */
function buildQuery(lat: number, lon: number, radius: number, limit: number): string {
  return `
[out:json][timeout:8];
(
  node["name"]["amenity"](around:${radius},${lat},${lon});
  node["name"]["shop"](around:${radius},${lat},${lon});
  node["name"]["tourism"](around:${radius},${lat},${lon});
  node["name"]["leisure"](around:${radius},${lat},${lon});
  node["name"]["historic"](around:${radius},${lat},${lon});
  node["name"]["craft"](around:${radius},${lat},${lon});
  node["name"]["office"](around:${radius},${lat},${lon});
);
out body ${limit};
`;
}

/**
 * Fetch POIs from our Next.js API route (proxied Overpass + Nominatim).
 * Using the API route avoids CORS issues and allows server-side caching.
 */
async function fetchPOIs(
  lat: number,
  lon: number,
  radius: number,
  limit: number,
): Promise<POI[]> {
  try {
    const res = await fetch(
      `/api/overpass?lat=${lat}&lon=${lon}&radius=${radius}&limit=${limit}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];

    const data = (await res.json()) as { places?: POI[] };
    return data.places ?? [];
  } catch {
    return [];
  }
}

/**
 * Creates the GeoJSON FeatureCollection from POI list.
 */
function toGeoJSON(pois: POI[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pois.map((poi) => ({
      type: "Feature",
      id: poi.id,
      geometry: { type: "Point", coordinates: [poi.lon, poi.lat] },
      properties: {
        name: poi.name,
        type: poi.type,
        category: poi.category,
        label: formatCategory(poi.type, poi.category),
        phone: poi.tags.phone ?? poi.tags["contact:phone"] ?? "",
        website: poi.tags.website ?? poi.tags["contact:website"] ?? "",
        opening_hours: poi.tags.opening_hours ?? "",
        address: poi.tags["addr:street"]
          ? [poi.tags["addr:housenumber"], poi.tags["addr:street"]].filter(Boolean).join(" ")
          : "",
      },
    })),
  };
}

/**
 * Attaches hover interaction to the POI layer.
 */
function attachHover(map: MapLibreMap): () => void {
  let hoveredId: string | number | null = null;

  const onMouseMove = (e: { features?: MapGeoJSONFeature[] }) => {
    const feature = e.features?.[0];
    if (!feature || feature.id === undefined || feature.id === hoveredId) return;
    if (!map.getLayer(HOVER_LAYER_ID)) return;
    hoveredId = feature.id;
    map.setFilter(HOVER_LAYER_ID, ["==", ["id"], hoveredId] as any);
    map.setPaintProperty(HOVER_LAYER_ID, "text-color", "#1a73e8");
  };

  const onMouseLeave = () => {
    if (hoveredId === null) return;
    hoveredId = null;
    if (!map.getLayer(HOVER_LAYER_ID)) return;
    map.setFilter(HOVER_LAYER_ID, ["==", ["id"], -999] as any);
  };

  map.on("mousemove", BASE_LAYER_ID, onMouseMove);
  map.on("mouseleave", BASE_LAYER_ID, onMouseLeave);

  return () => {
    map.off("mousemove", BASE_LAYER_ID, onMouseMove);
    map.off("mouseleave", BASE_LAYER_ID, onMouseLeave);
  };
}

/**
 * Creates an interactive POI overlay layer on a MapLibre map.
 *
 * @param map - The MapLibre map instance
 * @param onPOIClick - Callback when a POI label is clicked
 * @param options - Configuration options
 * @returns Cleanup function to remove the layer
 */
export function createPOIOverlay(
  map: MapLibreMap,
  onPOIClick: (poi: POI, properties: Record<string, string>) => void,
  options: POILayerOptions = {},
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let fetchTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let cleanupHover: (() => void) | null = null;

  // Debounced fetch on viewport change
  const scheduleFetch = () => {
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(async () => {
      if (destroyed) return;
      const zoom = map.getZoom();
      if (zoom < opts.minZoom) {
        // Hide POI layer at low zoom
        if (map.getLayer(BASE_LAYER_ID)) map.setLayoutProperty(BASE_LAYER_ID, "visibility", "none");
        if (map.getLayer(HOVER_LAYER_ID)) map.setLayoutProperty(HOVER_LAYER_ID, "visibility", "none");
        if (map.getLayer(CLICKED_LAYER_ID)) map.setLayoutProperty(CLICKED_LAYER_ID, "visibility", "none");
        return;
      }

      const center = map.getCenter();
      const pois = await fetchPOIs(center.lat, center.lng, opts.radius, opts.limit);
      if (destroyed) return;

      const geojson = toGeoJSON(pois);

      // Add or update source
      if (map.getSource(SOURCE_ID)) {
        (map.getSource(SOURCE_ID) as any).setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: "geojson", data: geojson, generateId: true });
      }

      // Add layers if they don't exist
      if (!map.getLayer(BASE_LAYER_ID)) {
        // Base POI label - white halo for readability over satellite imagery
        map.addLayer({
          id: BASE_LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 11,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            visibility: "visible",
          },
          paint: {
            "text-color": "#1a1a1a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
            "text-halo-blur": 0.5,
          },
        });

        // Hover layer: blue text, larger, always on top
        map.addLayer({
          id: HOVER_LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 14,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            visibility: "visible",
          },
          paint: {
            "text-color": "#1a73e8",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.5,
            "text-halo-blur": 0.3,
          },
          filter: ["==", ["id"], -999],
        });

        // Clicked layer: bold blue, stays visible after click
        map.addLayer({
          id: CLICKED_LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Bold"],
            "text-size": 14,
            "text-anchor": "center",
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            visibility: "visible",
          },
          paint: {
            "text-color": "#1a73e8",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2.5,
          },
          filter: ["==", ["id"], -999],
        });

        cleanupHover = attachHover(map);
      } else {
        // Update visibility
        map.setLayoutProperty(BASE_LAYER_ID, "visibility", "visible");
        map.setLayoutProperty(HOVER_LAYER_ID, "visibility", "visible");
        map.setLayoutProperty(CLICKED_LAYER_ID, "visibility", "visible");
      }
    }, opts.debounceMs);
  };

  // Click handler
  const onClick = (e: { features?: MapGeoJSONFeature[]; lngLat: { lat: number; lng: number } }) => {
    const feature = e.features?.[0];
    if (!feature || !feature.properties) return;

    const rawProps = feature.properties as Record<string, unknown>;
    const props: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawProps)) {
      props[key] = typeof value === "string" ? value : String(value ?? "");
    }

    const poi: POI = {
      id: feature.id as number,
      name: props.name ?? "Unknown",
      type: props.type ?? "place",
      category: props.category ?? "unknown",
      lat: e.lngLat.lat,
      lon: e.lngLat.lng,
      tags: {},
    };

    // Show clicked state
    if (map.getLayer(CLICKED_LAYER_ID) && feature.id !== undefined) {
      map.setFilter(CLICKED_LAYER_ID, ["==", ["id"], feature.id] as any);
    }

    onPOIClick(poi, props);
  };

  map.on("click", BASE_LAYER_ID, onClick);
  map.on("moveend", scheduleFetch);

  // Initial fetch
  scheduleFetch();

  // Cleanup function
  return () => {
    destroyed = true;
    if (fetchTimer) clearTimeout(fetchTimer);
    map.off("click", BASE_LAYER_ID, onClick);
    map.off("moveend", scheduleFetch);
    cleanupHover?.();

    if (map.getLayer(CLICKED_LAYER_ID)) map.removeLayer(CLICKED_LAYER_ID);
    if (map.getLayer(HOVER_LAYER_ID)) map.removeLayer(HOVER_LAYER_ID);
    if (map.getLayer(BASE_LAYER_ID)) map.removeLayer(BASE_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  };
}
