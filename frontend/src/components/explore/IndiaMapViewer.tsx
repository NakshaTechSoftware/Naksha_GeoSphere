"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LayersControl, type MapLayer } from "../map/LayersControl";

// Matches a place label (e.g. "Karnataka", "Bengaluru") rendered by the basemap's place layer
function featureMatchesName(feature: MapGeoJSONFeature, names: string[]) {
  const props = feature.properties ?? {};
  const candidates = [props.name, props["name:en"], props.name_en];
  return candidates.some(
    (value) =>
      typeof value === "string" && names.includes(value.trim().toLowerCase())
  );
}

const isKarnatakaFeature = (feature: MapGeoJSONFeature) =>
  featureMatchesName(feature, ["karnataka"]);

const isBengaluruFeature = (feature: MapGeoJSONFeature) =>
  featureMatchesName(feature, ["bengaluru", "bangalore"]);

const CITY_LABEL_LAYERS = ["label_city", "label_city_capital", "label_town"];

// Approximate geodesic area (m²) of a GeoJSON polygon, via an equirectangular projection
// centered on the polygon's mean latitude. Accurate to well under 1% at city/ward scale.
function calculatePolygonAreaSqm(geometry: GeoJSON.Geometry): number {
  const EARTH_RADIUS = 6378137; // meters (WGS84 equatorial radius)

  const ringAreaSqm = (ring: GeoJSON.Position[], latRad0: number): number => {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      if (!p1 || !p2) continue;
      const lng1 = p1[0] ?? 0;
      const lat1 = p1[1] ?? 0;
      const lng2 = p2[0] ?? 0;
      const lat2 = p2[1] ?? 0;
      const x1 = ((lng1 * Math.PI) / 180) * Math.cos(latRad0) * EARTH_RADIUS;
      const y1 = ((lat1 * Math.PI) / 180) * EARTH_RADIUS;
      const x2 = ((lng2 * Math.PI) / 180) * Math.cos(latRad0) * EARTH_RADIUS;
      const y2 = ((lat2 * Math.PI) / 180) * EARTH_RADIUS;
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
  };

  if (geometry.type === "Polygon") {
    const [outerRing, ...holes] = geometry.coordinates;
    if (!outerRing || outerRing.length === 0) return 0;
    const meanLat = outerRing.reduce((sum, c) => sum + (c[1] ?? 0), 0) / outerRing.length;
    const latRad0 = (meanLat * Math.PI) / 180;
    const outerArea = ringAreaSqm(outerRing, latRad0);
    const holesArea = holes.reduce((sum, hole) => sum + ringAreaSqm(hole, latRad0), 0);
    return outerArea - holesArea;
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce(
      (sum, polygonCoords) =>
        sum + calculatePolygonAreaSqm({ type: "Polygon", coordinates: polygonCoords }),
      0
    );
  }

  return 0;
}

// Computes the [[minLng, minLat], [maxLng, maxLat]] bounding box of a Polygon/MultiPolygon,
// for framing the camera on a clicked state via map.fitBounds.
function boundsOfGeometry(geometry: GeoJSON.Geometry): [[number, number], [number, number]] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visitRing = (ring: GeoJSON.Position[]) => {
    for (const [lng, lat] of ring) {
      if (lng === undefined || lat === undefined) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(visitRing);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach(visitRing));
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

const WARD_RATE_PER_SQM = 0.25; // ₹ per square meter, KML/KMZ ward boundaries only

export interface WardSelection {
  name: string;
  areaSqKm: number;
  price: number;
}

export interface IndiaMapViewerHandle {
  /** Loads the Karnataka or Bengaluru boundary when the query matches (case-insensitive). */
  search: (query: string) => void;
  /** Lists every Bengaluru boundary file, grouped by region subfolder (Central, East, ...). */
  listBengaluruFiles: () => Promise<Record<string, string[]>>;
  /** Loads (visible=true) or removes (visible=false) a single Bengaluru boundary file by its
   * full MinIO key, as an extra overlay layer alongside whatever's already on the map. */
  toggleBengaluruFile: (key: string, visible: boolean) => Promise<void>;
}

export interface IndiaMapViewerProps {
  /** Called when a search resolves to a single ward (e.g. "Bengaluru, Banaswadi"). Called with
   * null when the loaded boundaries are cleared (e.g. pressing Escape). */
  onWardSelected?: (ward: WardSelection | null) => void;
  /** Called when Escape clears every loaded boundary, so callers can reset their own UI state
   * (e.g. uncheck any manually-toggled extra files). */
  onBoundariesCleared?: () => void;
  /** Called when a search resolves to a specific region+file (e.g.
   * "Bengaluru, Central, Ward Boundary"), so callers can sync their own checkbox UI. */
  onExtraFileToggled?: (key: string, visible: boolean) => void;
}

// Source/layer ids for a selected state's district boundaries, loaded on demand from MinIO.
const STATE_DISTRICTS_SOURCE_ID = "state-districts-data";
const STATE_DISTRICTS_FILL_LAYER_ID = "state-districts-fill";
const STATE_DISTRICTS_LINE_LAYER_ID = "state-districts-line";

// Source/layer ids for a selected district's taluk/subdistrict boundaries
const DISTRICT_TALUKS_SOURCE_ID = "district-taluks-data";
const DISTRICT_TALUKS_FILL_LAYER_ID = "district-taluks-fill";
const DISTRICT_TALUKS_LINE_LAYER_ID = "district-taluks-line";

// Every layer/source id ever added by a boundary-loading flow (Karnataka, manual KML/KMZ
// upload, Bengaluru zones, or a state's districts) — cleared together when the user presses
// Escape.
const BOUNDARY_LAYER_IDS = [
  "kml-fill",
  "kml-line",
  "kml-points",
  "bengaluru-fill",
  "bengaluru-line",
  STATE_DISTRICTS_FILL_LAYER_ID,
  STATE_DISTRICTS_LINE_LAYER_ID,
  DISTRICT_TALUKS_FILL_LAYER_ID,
  DISTRICT_TALUKS_LINE_LAYER_ID,
];
const BOUNDARY_SOURCE_IDS = [
  "kml-data",
  "bengaluru-data",
  STATE_DISTRICTS_SOURCE_ID,
  DISTRICT_TALUKS_SOURCE_ID,
];

// Source id for the default india_states.geojson boundaries, loaded once on map init.
const STATE_SOURCE_ID = "india-states-default";

// "india/karnataka/Bengaluru/Central/GBA_Zone_Boundary.kmz" -> { Central: [key, ...], ... }
function groupBengaluruKeysBySubfolder(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const key of keys) {
    const match = key.match(/Bengaluru\/([^/]+)\/([^/]+)$/i);
    const subfolder = match?.[1];
    if (!subfolder) continue;
    if (!groups[subfolder]) groups[subfolder] = [];
    groups[subfolder].push(key);
  }
  return groups;
}

function extraLayerIdFromKey(key: string): string {
  return `extra-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

// Distinct color per boundary type so manually-toggled extra layers are visually distinguishable
function colorForBengaluruFileKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.includes("zone")) return "#3563e9"; // blue
  if (lower.includes("ward")) return "#10b981"; // green
  if (lower.includes("corporation")) return "#f59e0b"; // orange
  if (lower.includes("assembly")) return "#8b5cf6"; // purple
  return "#6b7280"; // gray fallback
}

export const IndiaMapViewer = forwardRef<IndiaMapViewerHandle, IndiaMapViewerProps>(
  function IndiaMapViewer({ onWardSelected, onBoundariesCleared, onExtraFileToggled }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const onWardSelectedRef = useRef(onWardSelected);
  useEffect(() => {
    onWardSelectedRef.current = onWardSelected;
  }, [onWardSelected]);
  const onBoundariesClearedRef = useRef(onBoundariesCleared);
  useEffect(() => {
    onBoundariesClearedRef.current = onBoundariesCleared;
  }, [onBoundariesCleared]);
  const onExtraFileToggledRef = useRef(onExtraFileToggled);
  useEffect(() => {
    onExtraFileToggledRef.current = onExtraFileToggled;
  }, [onExtraFileToggled]);
  // Keys of any manually-toggled extra Bengaluru files currently on the map (for Escape cleanup)
  const extraLayerKeysRef = useRef<Set<string>>(new Set());
  // Currently-selected feature id in the default states layer (shared between click and search)
  const selectedStateIdRef = useRef<string | number | null>(null);

  const clearStateSelection = (map: MapLibreMap) => {
    if (selectedStateIdRef.current !== null) {
      map.setFeatureState(
        { source: STATE_SOURCE_ID, id: selectedStateIdRef.current },
        { selected: false }
      );
      selectedStateIdRef.current = null;
    }
  };

  const selectStateFeature = (map: MapLibreMap, feature: MapGeoJSONFeature) => {
    if (feature.id === undefined) return;
    clearStateSelection(map);
    selectedStateIdRef.current = feature.id;
    map.setFeatureState({ source: STATE_SOURCE_ID, id: feature.id }, { selected: true });
    if (feature.geometry) {
      map.fitBounds(boundsOfGeometry(feature.geometry), {
        padding: 60,
        duration: 800,
        maxZoom: 7,
      });
    }
  };

  // Selects a state already present in the default india_states.geojson layer by name
  // (case-insensitive), e.g. from a "Karnataka" search. Returns false if the boundaries
  // haven't finished loading yet or no state with that name exists.
  const selectStateByName = (map: MapLibreMap, name: string): boolean => {
    if (!map.getSource(STATE_SOURCE_ID)) return false;
    const normalized = name.trim().toLowerCase();
    const features = map.querySourceFeatures(STATE_SOURCE_ID, {
      filter: ["==", ["downcase", ["get", "st_nm"]], normalized],
    });
    const feature = features[0];
    if (!feature) return false;
    selectStateFeature(map, feature);
    return true;
  };

  // Name (lowercased) of the state whose districts are currently loaded, if any.
  const loadedDistrictsStateRef = useRef<string | null>(null);
  // Currently-selected district feature id (mirrors selectedStateIdRef, one level down).
  const selectedDistrictIdRef = useRef<string | number | null>(null);
  
  // Name of the district whose taluks are currently loaded, if any.
  const loadedTaluksDistrictRef = useRef<string | null>(null);
  // Currently-selected taluk feature id.
  const selectedTalukIdRef = useRef<string | number | null>(null);

  const clearStateDistricts = (map: MapLibreMap) => {
    if (map.getLayer(STATE_DISTRICTS_FILL_LAYER_ID)) map.removeLayer(STATE_DISTRICTS_FILL_LAYER_ID);
    if (map.getLayer(STATE_DISTRICTS_LINE_LAYER_ID)) map.removeLayer(STATE_DISTRICTS_LINE_LAYER_ID);
    if (map.getSource(STATE_DISTRICTS_SOURCE_ID)) map.removeSource(STATE_DISTRICTS_SOURCE_ID);
    loadedDistrictsStateRef.current = null;
    selectedDistrictIdRef.current = null;
  };

  // Fetches and renders a state's district boundaries from MinIO (via /api/datasets/state-districts).
  // Triggered by clicking an already-selected state a second time. Hover/click handlers for the
  // resulting layer are registered once, up front, in the map's "load" handler below.
  const loadStateDistricts = async (map: MapLibreMap, stateName: string) => {
    const normalized = stateName.trim().toLowerCase();
    if (loadedDistrictsStateRef.current === normalized) return; // already showing

    try {
      const response = await fetch(`/api/datasets/state-districts?state=${encodeURIComponent(stateName)}`);
      if (!response.ok) {
        console.warn(`No district data available for "${stateName}"`);
        return;
      }
      const districtsData = await response.json();

      clearStateDistricts(map);

      // generateId assigns each district a numeric id, addressable via setFeatureState for
      // hover/selection highlighting (same technique as the state layer above).
      map.addSource(STATE_DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsData,
        generateId: true,
      });

      map.addLayer({
        id: STATE_DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: STATE_DISTRICTS_SOURCE_ID,
        paint: {
          "fill-color": "#f97316",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.35,
            ["boolean", ["feature-state", "hover"], false],
            0.2,
            0.05,
          ],
        },
      });

      map.addLayer({
        id: STATE_DISTRICTS_LINE_LAYER_ID,
        type: "line",
        source: STATE_DISTRICTS_SOURCE_ID,
        paint: {
          "line-color": "#f97316",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            1.25,
          ],
          "line-opacity": 0.9,
        },
      });

      loadedDistrictsStateRef.current = normalized;
    } catch (error) {
      console.error(`Failed to load district boundaries for "${stateName}":`, error);
    }
  };

  const clearDistrictTaluks = (map: MapLibreMap) => {
    if (map.getLayer(DISTRICT_TALUKS_FILL_LAYER_ID)) map.removeLayer(DISTRICT_TALUKS_FILL_LAYER_ID);
    if (map.getLayer(DISTRICT_TALUKS_LINE_LAYER_ID)) map.removeLayer(DISTRICT_TALUKS_LINE_LAYER_ID);
    if (map.getSource(DISTRICT_TALUKS_SOURCE_ID)) map.removeSource(DISTRICT_TALUKS_SOURCE_ID);
    loadedTaluksDistrictRef.current = null;
    selectedTalukIdRef.current = null;
  };

  // Fetches and renders a district's taluk/subdistrict boundaries from MinIO
  // (via /api/datasets/district-taluks). Triggered by clicking an already-selected
  // district a second time.
  const loadDistrictTaluks = async (map: MapLibreMap, districtName: string, stateName: string) => {
    const normalized = districtName.trim().toLowerCase();
    if (loadedTaluksDistrictRef.current === normalized) return; // already showing

    console.log(`Loading taluks for district: ${districtName}, state: ${stateName}`);

    try {
      const url = `/api/datasets/district-taluks?district=${encodeURIComponent(districtName)}&state=${encodeURIComponent(stateName)}`;
      console.log(`Fetching taluks from: ${url}`);
      
      const response = await fetch(url);
      
      console.log(`Taluk fetch response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`No taluk data available for district "${districtName}":`, errorText);
        return;
      }
      
      const taluksData = await response.json();
      console.log(`Taluk data loaded, features count:`, taluksData.features?.length);

      clearDistrictTaluks(map);

      map.addSource(DISTRICT_TALUKS_SOURCE_ID, {
        type: "geojson",
        data: taluksData,
        generateId: true,
      });

      map.addLayer({
        id: DISTRICT_TALUKS_FILL_LAYER_ID,
        type: "fill",
        source: DISTRICT_TALUKS_SOURCE_ID,
        paint: {
          "fill-color": "#8b5cf6",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.4,
            ["boolean", ["feature-state", "hover"], false],
            0.25,
            0.08,
          ],
        },
      });

      map.addLayer({
        id: DISTRICT_TALUKS_LINE_LAYER_ID,
        type: "line",
        source: DISTRICT_TALUKS_SOURCE_ID,
        paint: {
          "line-color": "#8b5cf6",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2.5,
            1,
          ],
          "line-opacity": 0.85,
        },
      });

      loadedTaluksDistrictRef.current = normalized;
    } catch (error) {
      console.error(`Failed to load taluk boundaries for "${districtName}":`, error);
    }
  };

  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [currentLayer, setCurrentLayer] = useState<MapLayer>("default");

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      try {
        // Initialize MapLibre with a colorful vector basemap
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        // Get appropriate style based on current layer
        const getMapStyle = () => {
          // Start with a minimal OpenStreetMap style that we'll build upon
          return {
            version: 8,
            sources: {
              "osm-tiles": {
                type: "raster",
                tiles: [
                  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
                ],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [
              {
                id: "osm-layer",
                type: "raster",
                source: "osm-tiles",
              },
            ],
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
          };
        };

        // OpenFreeMap "Liberty" style: MapLibre's classic look (parks, land, water, roads all colored)
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getMapStyle() as any,
          center: [78.9629, 20.5937], // Center of India
          zoom: 4.5,
          attributionControl: false,
        });

        mapRef.current = map;

        // Distance scale bar
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
          "bottom-right"
        );

        map.on("load", async () => {
          if (cancelled) return;

          // Load India state boundaries by default
          try {
            const statesResponse = await fetch("/data/india_states.geojson");
            const statesData = await statesResponse.json();

            // Add state boundaries source. generateId assigns each feature a numeric id so we
            // can address it with setFeatureState for hover/selection highlighting below.
            map.addSource(STATE_SOURCE_ID, {
              type: "geojson",
              data: statesData,
              generateId: true,
            });

            // Invisible-by-default fill so hovering/clicking anywhere inside a state's
            // boundary (not just on its border line) triggers the highlight.
            map.addLayer({
              id: "states-fill-default",
              type: "fill",
              source: STATE_SOURCE_ID,
              paint: {
                "fill-color": "#04D9FF",
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  0.35,
                  ["boolean", ["feature-state", "hover"], false],
                  0.18,
                  0,
                ],
              },
            });

            // Add state boundary lines
            map.addLayer({
              id: "states-borders-default",
              type: "line",
              source: STATE_SOURCE_ID,
              paint: {
                "line-color": "#04D9FF",
                "line-width": [
                  "case",
                  ["boolean", ["feature-state", "selected"], false],
                  3,
                  1.5,
                ],
                "line-opacity": 0.8,
              },
            });

            let hoveredStateId: string | number | null = null;

            map.on("mousemove", "states-fill-default", (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredStateId !== null && hoveredStateId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_SOURCE_ID, id: hoveredStateId },
                  { hover: false }
                );
              }
              hoveredStateId = feature.id;
              map.setFeatureState(
                { source: STATE_SOURCE_ID, id: hoveredStateId },
                { hover: true }
              );
              map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", "states-fill-default", () => {
              if (hoveredStateId !== null) {
                map.setFeatureState(
                  { source: STATE_SOURCE_ID, id: hoveredStateId },
                  { hover: false }
                );
              }
              hoveredStateId = null;
              map.getCanvas().style.cursor = "";
            });

            map.on("click", "states-fill-default", (e) => {
              console.log("=== STATE CLICK EVENT ===");
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // If districts are currently visible, ignore state clicks (district layer is on top)
              if (loadedDistrictsStateRef.current !== null) {
                console.log("Districts are loaded - ignoring state click (click was on district layer)");
                return;
              }

              // Check if clicking the same state again (toggle behavior)
              const wasSelected = selectedStateIdRef.current === feature.id;
              
              if (wasSelected) {
                // Deselect state and clear districts
                clearStateSelection(map);
                clearStateDistricts(map);
                clearDistrictTaluks(map);
              } else {
                // Deselect previous state if any
                if (selectedStateIdRef.current !== null) {
                  clearStateSelection(map);
                  clearStateDistricts(map);
                  clearDistrictTaluks(map);
                }
                
                // Select new state and auto-load districts
                selectStateFeature(map, feature);
                
                // Automatically load districts for the selected state
                const stateName = feature.properties?.st_nm as string | undefined;
                if (stateName) {
                  console.log(`Auto-loading districts for state: ${stateName}`);
                  void loadStateDistricts(map, stateName);
                }
              }
            });

            // Hover/click highlighting for a state's districts, once loaded. Registered once
            // here (rather than inside loadStateDistricts) so re-loading districts for a
            // different state doesn't stack up duplicate listeners.
            let hoveredDistrictId: string | number | null = null;

            map.on("mousemove", STATE_DISTRICTS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredDistrictId !== null && hoveredDistrictId !== feature.id) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                  { hover: false }
                );
              }
              hoveredDistrictId = feature.id;
              map.setFeatureState(
                { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                { hover: true }
              );
              map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", STATE_DISTRICTS_FILL_LAYER_ID, () => {
              if (hoveredDistrictId !== null) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: hoveredDistrictId },
                  { hover: false }
                );
              }
              hoveredDistrictId = null;
              map.getCanvas().style.cursor = "";
            });

            map.on("click", STATE_DISTRICTS_FILL_LAYER_ID, (e) => {
              console.log("=== DISTRICT CLICK EVENT ===");
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              // Check if this district already has taluks loaded
              const districtName = feature.properties?.dtname as string | undefined;
              const normalizedDistrictName = districtName?.trim().toLowerCase();
              const taluksAlreadyLoaded = loadedTaluksDistrictRef.current === normalizedDistrictName;
              
              console.log(`District: ${districtName}, Already loaded: ${taluksAlreadyLoaded}, Selected ID: ${selectedDistrictIdRef.current}, Feature ID: ${feature.id}`);

              // If clicking the same district that already has taluks loaded, toggle (deselect)
              if (selectedDistrictIdRef.current === feature.id && taluksAlreadyLoaded) {
                // Toggle off - deselect district and clear taluks
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                  { selected: false }
                );
                selectedDistrictIdRef.current = null;
                clearDistrictTaluks(map);
                e.preventDefault();
                if (e.originalEvent) {
                  e.originalEvent.stopPropagation();
                }
                return;
              }

              // Deselect previous district if clicking a different one
              if (selectedDistrictIdRef.current !== null && selectedDistrictIdRef.current !== feature.id) {
                map.setFeatureState(
                  { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                  { selected: false }
                );
                // Clear taluks from previous district
                clearDistrictTaluks(map);
              }

              // Select the new district
              selectedDistrictIdRef.current = feature.id;
              map.setFeatureState(
                { source: STATE_DISTRICTS_SOURCE_ID, id: selectedDistrictIdRef.current },
                { selected: true }
              );
              
              // Zoom to district
              if (feature.geometry) {
                map.fitBounds(boundsOfGeometry(feature.geometry), {
                  padding: 100,
                  duration: 800,
                  maxZoom: 11,
                });
              }

              // Automatically load taluks when district is selected
              const stateName = feature.properties?.stname as string | undefined;
              if (districtName && stateName) {
                console.log(`Loading taluks automatically for ${districtName}, ${stateName}`);
                void loadDistrictTaluks(map, districtName, stateName);
              }
              
              // Prevent this click from bubbling to the states-fill-default handler
              e.preventDefault();
              if (e.originalEvent) {
                e.originalEvent.stopPropagation();
              }
            });

            // Hover/click highlighting for taluks, once loaded. Registered once here
            // (rather than inside loadDistrictTaluks) so re-loading taluks for a
            // different district doesn't stack up duplicate listeners.
            let hoveredTalukId: string | number | null = null;

            map.on("mousemove", DISTRICT_TALUKS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (hoveredTalukId !== null && hoveredTalukId !== feature.id) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                  { hover: false }
                );
              }
              hoveredTalukId = feature.id;
              map.setFeatureState(
                { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                { hover: true }
              );
              map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", DISTRICT_TALUKS_FILL_LAYER_ID, () => {
              if (hoveredTalukId !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: hoveredTalukId },
                  { hover: false }
                );
              }
              hoveredTalukId = null;
              map.getCanvas().style.cursor = "";
            });

            map.on("click", DISTRICT_TALUKS_FILL_LAYER_ID, (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.id === undefined) return;

              if (selectedTalukIdRef.current !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: selectedTalukIdRef.current },
                  { selected: false }
                );
              }

              // Toggle selection
              const wasSelected = selectedTalukIdRef.current === feature.id;
              selectedTalukIdRef.current = wasSelected ? null : feature.id;
              
              if (selectedTalukIdRef.current !== null) {
                map.setFeatureState(
                  { source: DISTRICT_TALUKS_SOURCE_ID, id: selectedTalukIdRef.current },
                  { selected: true }
                );
                
                // Zoom to taluk boundary
                if (feature.geometry) {
                  map.fitBounds(boundsOfGeometry(feature.geometry), {
                    padding: 120,
                    duration: 800,
                    maxZoom: 12,
                  });
                }

                // Show taluk info popup
                const talukName = feature.properties?.subdist_nm || feature.properties?.name || "Unknown Taluk";
                
                // Calculate center for popup
                const bounds = boundsOfGeometry(feature.geometry);
                const centerLng = (bounds[0][0] + bounds[1][0]) / 2;
                const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
                
                new maplibregl.Popup({
                  closeButton: true,
                  closeOnClick: false,
                })
                  .setLngLat([centerLng, centerLat])
                  .setHTML(
                    `
                    <div style="padding: 10px; font-family: system-ui, -apple-system, sans-serif; min-width: 150px;">
                      <h3 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: #1e293b;">${talukName}</h3>
                      <p style="margin: 0; font-size: 12px; color: #64748b;">Taluk/Subdistrict</p>
                    </div>
                  `
                  )
                  .addTo(map);
              }
              
              // Prevent bubbling to district handler
              e.preventDefault();
            });

            // Add state labels
            map.addLayer({
              id: "states-labels-default",
              type: "symbol",
              source: "india-states-default",
              layout: {
                "text-field": ["get", "st_nm"],
                "text-font": ["Noto Sans Regular"],
                "text-size": 12,
                "text-anchor": "center",
              },
              paint: {
                "text-color": "#475569",
                "text-halo-color": "#ffffff",
                "text-halo-width": 2,
              },
            });
          } catch (error) {
            console.error("Failed to load India state boundaries:", error);
          }

          setIsLoading(false);
        });

        // Note: Removed label_state and CITY_LABEL_LAYERS event handlers since we're now
        // using raster tiles instead of vector tiles. Users can click states directly
        // from the states-fill-default layer, or use the search bar.

        // Note: bengaluru-fill layer handlers are registered dynamically when that layer
        // is added (in loadBengaluruBoundaryFromMinIO function), not here at initialization.

        map.on("error", (e) => {
          // Only treat this as fatal (show "Map temporarily unavailable") if the base style
          // itself never loaded. A post-load error (e.g. a missing glyph/tile for an overlay
          // layer) shouldn't take down an already-working map.
          if (!cancelled && !map.isStyleLoaded()) {
            console.error("Map error (fatal, style never loaded):", e.error ?? e);
            setLoadError(true);
            setIsLoading(false);
          } else {
            // Non-fatal errors (missing tiles, glyphs, etc.) - just log and continue
            console.warn("Map error (non-fatal):", e.error ?? e);
          }
        });
      } catch (error) {
        console.error("Failed to initialize map:", error);
        if (!cancelled) {
          setLoadError(true);
          setIsLoading(false);
        }
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // Removed currentLayer dependency - layer changes handled separately

  // Handle layer changes
  const handleLayerChange = async (layer: MapLayer) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Get the current style to preserve custom sources and layers
    const style = map.getStyle();
    const currentLayers = style.layers;
    
    // Identify custom layers we want to keep
    const customLayerIds = currentLayers
      .filter((l) => 
        l.id === "states-fill-default" ||
        l.id === "states-borders-default" ||
        l.id === "states-labels-default" ||
        l.id === STATE_DISTRICTS_FILL_LAYER_ID ||
        l.id === STATE_DISTRICTS_LINE_LAYER_ID ||
        l.id.startsWith("kml-") ||
        l.id.startsWith("bengaluru-") ||
        l.id.startsWith("extra-")
      )
      .map((l) => l.id);
    
    // Identify custom sources we want to keep
    const customSourceIds = Object.keys(style.sources).filter(
      (sourceId) =>
        sourceId === STATE_SOURCE_ID ||
        sourceId === STATE_DISTRICTS_SOURCE_ID ||
        sourceId === "kml-data" ||
        sourceId === "bengaluru-data" ||
        sourceId.startsWith("extra-")
    );
    
    // Get custom sources data
    const customSources: Record<string, any> = {};
    customSourceIds.forEach((sourceId) => {
      customSources[sourceId] = style.sources[sourceId];
    });
    
    // Remove base map layers (everything except our custom layers)
    currentLayers.forEach((l) => {
      if (!customLayerIds.includes(l.id) && map.getLayer(l.id)) {
        map.removeLayer(l.id);
      }
    });
    
    // Remove base map sources
    Object.keys(style.sources).forEach((sourceId) => {
      if (!customSourceIds.includes(sourceId) && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });
    
    // Add new base layer based on selection
    const firstCustomLayerId = customLayerIds.length > 0 ? customLayerIds[0] : undefined;
    
    switch (layer) {
      case "satellite":
        map.addSource("satellite-base", {
          type: "raster",
          tiles: [
            "https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
            "https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
          ],
          tileSize: 256,
          attribution: "© Google",
          minzoom: 0,
          maxzoom: 20,
        });

        map.addLayer(
          {
            id: "satellite-base-layer",
            type: "raster",
            source: "satellite-base",
            minzoom: 0,
            maxzoom: 20,
          },
          firstCustomLayerId
        );
        break;

      case "terrain":
        map.addSource("terrain-tiles", {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Esri, USGS, NOAA",
        });

        map.addLayer(
          {
            id: "terrain-layer",
            type: "raster",
            source: "terrain-tiles",
          },
          firstCustomLayerId
        );
        break;

      case "default":
        // Add default OSM-style tiles
        map.addSource("osm-tiles", {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        });

        map.addLayer(
          {
            id: "osm-layer",
            type: "raster",
            source: "osm-tiles",
          },
          firstCustomLayerId
        );
        break;
    }

    setCurrentLayer(layer);
  };

  // Pressing Escape clears any loaded boundary (Karnataka, Bengaluru wards, or a manually
  // uploaded KML/KMZ) so the user can freshly load a new one.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const map = mapRef.current;
      if (!map) return;

      BOUNDARY_LAYER_IDS.forEach((layerId) => {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      });
      BOUNDARY_SOURCE_IDS.forEach((sourceId) => {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      });

      // Clear any manually-toggled extra Bengaluru files too
      extraLayerKeysRef.current.forEach((key) => {
        const baseId = extraLayerIdFromKey(key);
        if (map.getLayer(`${baseId}-fill`)) map.removeLayer(`${baseId}-fill`);
        if (map.getLayer(`${baseId}-line`)) map.removeLayer(`${baseId}-line`);
        if (map.getSource(`${baseId}-data`)) map.removeSource(`${baseId}-data`);
      });
      extraLayerKeysRef.current.clear();
      loadedDistrictsStateRef.current = null;
      clearStateSelection(map);

      setUploadedFileName(null);
      onWardSelectedRef.current?.(null);
      onBoundariesClearedRef.current?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Loads/removes a single Bengaluru boundary file as an extra overlay layer (used by both the
  // Type filter's checkboxes and a 3-part search like "Bengaluru, Central, Ward Boundary").
  // Returns true if a layer ends up visible on the map.
  const applyBengaluruExtraFile = async (
    map: MapLibreMap,
    key: string,
    visible: boolean
  ): Promise<boolean> => {
    const baseId = extraLayerIdFromKey(key);
    if (map.getLayer(`${baseId}-fill`)) map.removeLayer(`${baseId}-fill`);
    if (map.getLayer(`${baseId}-line`)) map.removeLayer(`${baseId}-line`);
    if (map.getSource(`${baseId}-data`)) map.removeSource(`${baseId}-data`);
    extraLayerKeysRef.current.delete(key);

    if (!visible) return false;

    const features = await loadBengaluruFileFeatures(key);
    if (features.length === 0) {
      console.warn(`No features found in ${key}`);
      return false;
    }

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    const color = colorForBengaluruFileKey(key);

    map.addSource(`${baseId}-data`, { type: "geojson", data: geojson });
    map.addLayer({
      id: `${baseId}-fill`,
      type: "fill",
      source: `${baseId}-data`,
      filter: ["==", "$type", "Polygon"],
      paint: { "fill-color": color, "fill-opacity": 0.2 },
    });
    map.addLayer({
      id: `${baseId}-line`,
      type: "line",
      source: `${baseId}-data`,
      filter: ["==", "$type", "Polygon"],
      paint: { "line-color": color, "line-width": 1.5 },
    });
    extraLayerKeysRef.current.add(key);

    // Fit bounds so a freshly-searched file is actually visible
    const maplibregl = await import("maplibre-gl");
    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;
    const extendWithCoords = (coords: unknown): void => {
      if (Array.isArray(coords) && typeof coords[0] === "number") {
        bounds.extend(coords as [number, number]);
        hasBounds = true;
      } else if (Array.isArray(coords)) {
        coords.forEach(extendWithCoords);
      }
    };
    features.forEach((feature) => {
      if (feature.geometry && "coordinates" in feature.geometry) {
        extendWithCoords(feature.geometry.coordinates);
      }
    });
    if (hasBounds) map.fitBounds(bounds, { padding: 50, duration: 1000 });

    return true;
  };

  // Finds the file key for a "Bengaluru, <Region>, <File Type>" search, e.g.
  // ("Central", "Ward Boundary") -> "india/karnataka/Bengaluru/Central/Ward Boundary.kmz"
  const findBengaluruFileKey = async (
    regionQuery: string,
    fileQuery: string
  ): Promise<string | null> => {
    const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
    if (!listResponse.ok) return null;
    const { keys } = (await listResponse.json()) as { keys: string[] };
    const grouped = groupBengaluruKeysBySubfolder(keys ?? []);

    const region = Object.keys(grouped).find(
      (name) => name.toLowerCase() === regionQuery.trim().toLowerCase()
    );
    if (!region) return null;

    const normalizedFileQuery = fileQuery.trim().toLowerCase();
    return (
      grouped[region]?.find((key) => {
        const displayName = (key.split("/").pop() ?? "")
          .replace(/\.kmz$/i, "")
          .replace(/_/g, " ")
          .toLowerCase();
        return displayName.includes(normalizedFileQuery);
      }) ?? null
    );
  };

  useImperativeHandle(ref, () => ({
    search: (query: string) => {
      const map = mapRef.current;
      if (!map) return;

      // Supports:
      //  "Karnataka"
      //  "Bengaluru" (all zones) / "Bengaluru, <ward name>" (a single ward)
      //  "Bengaluru, <Region>, <File type>" (e.g. "Bengaluru, Central, Ward Boundary")
      const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
      const place = parts[0]?.toLowerCase() ?? "";

      if (parts.length === 1 && place === "karnataka") {
        // Karnataka's boundary already lives in the default india_states.geojson layer —
        // select it there instead of fetching a separate KMZ from MinIO.
        if (!selectStateByName(map, "Karnataka")) {
          loadKarnatakaStateFromMinIO(map);
        }
        return;
      }

      if (place !== "bengaluru" && place !== "bangalore") return;

      const [, regionQuery, fileQuery] = parts;
      if (regionQuery && fileQuery) {
        void (async () => {
          const key = await findBengaluruFileKey(regionQuery, fileQuery);
          if (!key) {
            console.warn(`No file matching "${fileQuery}" found in Bengaluru/${regionQuery}`);
            return;
          }
          const loaded = await applyBengaluruExtraFile(map, key, true);
          if (loaded) onExtraFileToggledRef.current?.(key, true);
        })();
        return;
      }

      loadBengaluruBoundaryFromMinIO(map, regionQuery);
    },
    listBengaluruFiles: async () => {
      const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
      if (!listResponse.ok) return {};
      const { keys } = (await listResponse.json()) as { keys: string[] };
      return groupBengaluruKeysBySubfolder(keys ?? []);
    },
    toggleBengaluruFile: async (key: string, visible: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      await applyBengaluruExtraFile(map, key, visible);
    },
  }));

  // Loads Karnataka's boundary from MinIO when the user clicks its label on the map
  const loadKarnatakaStateFromMinIO = async (map: MapLibreMap) => {
    try {
      console.log("Loading Karnataka State boundary from MinIO...");
      
      // Fetch KMZ from our Next.js API route (which proxies to backend → MinIO)
      const response = await fetch('/api/datasets/karnataka-boundary-kmz');
      
      if (!response.ok) {
        // Silently fail - user can still use manual upload
        // const errorData = await response.json().catch(() => ({}));
        // console.error('Failed to fetch KMZ:', errorData);
        return;
      }
      
      const kmzBlob = await response.blob();
      
      // Process KMZ same way as manual upload
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(kmzBlob);
      
      // Find the main KML file
      let kmlFile = zipContent.file("doc.kml");
      if (!kmlFile) {
        const kmlFiles = Object.keys(zipContent.files).filter((name) =>
          name.toLowerCase().endsWith(".kml")
        );
        const firstKmlFile = kmlFiles[0];
        if (!firstKmlFile) {
          throw new Error("No KML file found in KMZ archive");
        }
        kmlFile = zipContent.file(firstKmlFile);
      }
      
      if (!kmlFile) {
        throw new Error("Could not read KML from KMZ");
      }
      
      const kmlText = await kmlFile.async("text");
      const geojson = parseKMLToGeoJSON(kmlText);
      
      // Remove existing KML layer if any
      if (map.getLayer("kml-fill")) map.removeLayer("kml-fill");
      if (map.getLayer("kml-line")) map.removeLayer("kml-line");
      if (map.getLayer("kml-points")) map.removeLayer("kml-points");
      if (map.getSource("kml-data")) map.removeSource("kml-data");
      
      // Add KML data to map
      map.addSource("kml-data", {
        type: "geojson",
        data: geojson,
      });
      
      // Add polygon fill layer
      map.addLayer({
        id: "kml-fill",
        type: "fill",
        source: "kml-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.3,
        },
      });
      
      // Add line layer
      map.addLayer({
        id: "kml-line",
        type: "line",
        source: "kml-data",
        filter: ["in", "$type", "LineString", "Polygon"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
        },
      });
      
      // Add points layer
      map.addLayer({
        id: "kml-points",
        type: "circle",
        source: "kml-data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      
      // Fit map to KML bounds
      if (geojson.features.length > 0) {
        const maplibregl = await import("maplibre-gl");
        const bounds = geojson.features.reduce(
          (bounds, feature) => {
            const geometry = feature.geometry;
            if (geometry.type === "Point") {
              bounds.extend(geometry.coordinates as [number, number]);
            } else if (geometry.type === "LineString") {
              geometry.coordinates.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            } else if (geometry.type === "Polygon") {
              geometry.coordinates[0]?.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            }
            return bounds;
          },
          new maplibregl.LngLatBounds()
        );
        
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }
      
      setUploadedFileName("State.kmz (Auto-loaded from MinIO)");
      console.log(`Successfully auto-loaded Karnataka State boundary with ${geojson.features.length} feature(s)`);
      
    } catch (error) {
      console.error("Could not auto-load KMZ:", error);
      // Fail silently - user can still manually upload if needed
    }
  };

  // Each Bengaluru boundary file (Assembly Constituency, Corporation, Zone, or Ward Boundary)
  // is a single-purpose KMZ where every polygon placemark has a real, unique name.
  const parseNamedPolygonsFromKML = (kmlText: string): GeoJSON.FeatureCollection => {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "text/xml");

    const placemarks = kmlDoc.getElementsByTagName("Placemark");
    const features: GeoJSON.Feature[] = [];

    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      if (!placemark) continue;
      const name = placemark.getElementsByTagName("name")[0]?.textContent?.trim();
      if (!name) continue; // skip unnamed placemarks from other boundary layers

      const polygon = placemark.getElementsByTagName("Polygon")[0];
      if (!polygon) continue;

      const outerBoundary = polygon.getElementsByTagName("outerBoundaryIs")[0];
      const linearRing = outerBoundary?.getElementsByTagName("LinearRing")[0];
      const coordsText = linearRing?.getElementsByTagName("coordinates")[0]?.textContent?.trim();
      if (!coordsText) continue;

      const coordinates = coordsText
        .split(/\s+/)
        .map((coord) => {
          const [lng, lat] = coord.split(",").map(Number);
          return [lng ?? NaN, lat ?? NaN];
        })
        .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));

      if (coordinates.length === 0) continue;

      features.push({
        type: "Feature",
        properties: { name },
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      });
    }

    return { type: "FeatureCollection", features };
  };

  // Parses a single Bengaluru boundary file (KMZ, KML, or GeoJSON) into GeoJSON features
  const loadBengaluruFileFeatures = async (key: string): Promise<GeoJSON.Feature[]> => {
    const response = await fetch(`/api/datasets/bengaluru-boundary-file?key=${encodeURIComponent(key)}`);
    if (!response.ok) {
      // Silently fail - optional boundary files
      // const errorData = await response.json().catch(() => ({}));
      // console.error(`Failed to fetch ${key}:`, errorData);
      return [];
    }

    const lowerKey = key.toLowerCase();

    if (lowerKey.endsWith(".kmz")) {
      const blob = await response.blob();
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(blob);

      let kmlFile = zipContent.file("doc.kml");
      if (!kmlFile) {
        const kmlFiles = Object.keys(zipContent.files).filter((name) =>
          name.toLowerCase().endsWith(".kml")
        );
        const firstKmlFile = kmlFiles[0];
        if (!firstKmlFile) return [];
        kmlFile = zipContent.file(firstKmlFile);
      }
      if (!kmlFile) return [];

      const kmlText = await kmlFile.async("text");
      return parseNamedPolygonsFromKML(kmlText).features;
    }

    if (lowerKey.endsWith(".kml")) {
      const kmlText = await response.text();
      return parseNamedPolygonsFromKML(kmlText).features;
    }

    if (lowerKey.endsWith(".geojson") || lowerKey.endsWith(".json")) {
      const geojson = await response.json();
      return geojson.features ?? [];
    }

    console.warn(`Skipping unsupported file type: ${key}`);
    return [];
  };

  // By default, loads each region subfolder's Zone Boundary file when the user clicks
  // Bengaluru's label on the map. If wardQuery is given (e.g. from searching
  // "Bengaluru, Banaswadi"), each subfolder's Ward Boundary file is loaded instead and
  // filtered down to the matching ward.
  const loadBengaluruBoundaryFromMinIO = async (map: MapLibreMap, wardQuery?: string) => {
    try {
      console.log("Loading Bengaluru boundary files from MinIO...");

      const listResponse = await fetch('/api/datasets/bengaluru-boundary-list');
      if (!listResponse.ok) {
        const errorData = await listResponse.json().catch(() => ({}));
        console.error('Failed to list Bengaluru boundary files:', errorData);
        return; // Fail silently, user can still use manual upload
      }

      const { keys } = (await listResponse.json()) as { keys: string[] };
      if (!keys || keys.length === 0) {
        console.warn("No files found in Bengaluru folder");
        return;
      }

      // Pick one file per subfolder: the ward boundary when searching for a ward,
      // otherwise the zone boundary (the default overview shown on a plain city click)
      const typeKeyword = wardQuery ? "ward" : "zone";
      const grouped = groupBengaluruKeysBySubfolder(keys);
      const selectedKeys = Object.values(grouped)
        .map((filesInSubfolder) =>
          filesInSubfolder.find((key) => key.toLowerCase().includes(typeKeyword))
        )
        .filter((key): key is string => Boolean(key));

      if (selectedKeys.length === 0) {
        console.warn(`No "${typeKeyword}" boundary files found across Bengaluru's subfolders`);
        return;
      }

      const featureLists = await Promise.all(selectedKeys.map(loadBengaluruFileFeatures));
      let features = featureLists.flat();

      if (features.length === 0) {
        console.warn("No usable features found across Bengaluru boundary files");
        return;
      }

      if (wardQuery) {
        const normalizedWard = wardQuery.trim().toLowerCase();
        const matched = features.filter((feature) => {
          const name = feature.properties?.name;
          return typeof name === "string" && name.toLowerCase().includes(normalizedWard);
        });

        if (matched.length > 0) {
          features = matched;

          const totalAreaSqm = matched.reduce(
            (sum, feature) =>
              sum + (feature.geometry ? calculatePolygonAreaSqm(feature.geometry) : 0),
            0
          );
          const wardName =
            (matched[0]?.properties?.name as string | undefined) ?? wardQuery;

          onWardSelectedRef.current?.({
            name: wardName,
            areaSqKm: totalAreaSqm / 1_000_000,
            price: totalAreaSqm * WARD_RATE_PER_SQM,
          });
        } else {
          console.warn(`No ward matching "${wardQuery}" found; showing all wards instead`);
        }
      }

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features,
      };

      // Remove existing Bengaluru layers if any
      if (map.getLayer("bengaluru-fill")) map.removeLayer("bengaluru-fill");
      if (map.getLayer("bengaluru-line")) map.removeLayer("bengaluru-line");
      if (map.getLayer("bengaluru-points")) map.removeLayer("bengaluru-points");
      if (map.getSource("bengaluru-data")) map.removeSource("bengaluru-data");

      map.addSource("bengaluru-data", {
        type: "geojson",
        data: geojson,
      });

      // Add polygon fill layer
      map.addLayer({
        id: "bengaluru-fill",
        type: "fill",
        source: "bengaluru-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#3563e9",
          "fill-opacity": 0.25,
        },
      });

      // Add outline layer (polygons only — point placemarks are intentionally not rendered)
      map.addLayer({
        id: "bengaluru-line",
        type: "line",
        source: "bengaluru-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "line-color": "#3563e9",
          "line-width": 1.5,
        },
      });

      // Fit map to the combined bounds of every loaded file
      const maplibregl = await import("maplibre-gl");
      const bounds = new maplibregl.LngLatBounds();
      let hasBounds = false;

      const extendWithCoords = (coords: unknown): void => {
        if (Array.isArray(coords) && typeof coords[0] === "number") {
          bounds.extend(coords as [number, number]);
          hasBounds = true;
        } else if (Array.isArray(coords)) {
          coords.forEach(extendWithCoords);
        }
      };

      features.forEach((feature) => {
        if (feature.geometry && "coordinates" in feature.geometry) {
          extendWithCoords(feature.geometry.coordinates);
        }
      });

      if (hasBounds) {
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }

      console.log(
        `Successfully loaded ${features.length} feature(s) from ${selectedKeys.length} Bengaluru boundary file(s)`
      );

    } catch (error) {
      console.error("Could not load Bengaluru boundary files:", error);
      // Fail silently - user can still manually upload if needed
    }
  };

  const handleDownloadKML = () => {
    // Simple India boundary for KML download
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>India Boundary</name>
    <description>India country boundary - simplified</description>
    <Placemark>
      <name>India</name>
      <Point>
        <coordinates>78.9629,20.5937,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

    const blob = new Blob([kml], {
      type: "application/vnd.google-earth.kml+xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "india-location.kml";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseKMLToGeoJSON = (kmlText: string): GeoJSON.FeatureCollection => {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "text/xml");
    
    const features: GeoJSON.Feature[] = [];
    
    // Parse Placemarks
    const placemarks = kmlDoc.getElementsByTagName("Placemark");
    
    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      if (!placemark) continue;
      const name = placemark.getElementsByTagName("name")[0]?.textContent || `Feature ${i + 1}`;
      const description = placemark.getElementsByTagName("description")[0]?.textContent || "";
      
      // Parse Point
      const point = placemark.getElementsByTagName("Point")[0];
      if (point) {
        const coordsText = point.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordsText) {
          const [lng, lat] = coordsText.split(",").map(Number);
          features.push({
            type: "Feature",
            properties: { name, description },
            geometry: {
              type: "Point",
              coordinates: [lng ?? 0, lat ?? 0],
            },
          });
        }
      }
      
      // Parse LineString
      const lineString = placemark.getElementsByTagName("LineString")[0];
      if (lineString) {
        const coordsText = lineString.getElementsByTagName("coordinates")[0]?.textContent?.trim();
        if (coordsText) {
          const coordinates = coordsText
            .split(/\s+/)
            .map((coord) => {
              const [lng, lat] = coord.split(",").map(Number);
              return [lng, lat];
            })
            .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));
          
          if (coordinates.length > 0) {
            features.push({
              type: "Feature",
              properties: { name, description },
              geometry: {
                type: "LineString",
                coordinates,
              },
            });
          }
        }
      }
      
      // Parse Polygon
      const polygon = placemark.getElementsByTagName("Polygon")[0];
      if (polygon) {
        const outerBoundary = polygon.getElementsByTagName("outerBoundaryIs")[0];
        if (outerBoundary) {
          const linearRing = outerBoundary.getElementsByTagName("LinearRing")[0];
          if (linearRing) {
            const coordsText = linearRing.getElementsByTagName("coordinates")[0]?.textContent?.trim();
            if (coordsText) {
              const coordinates = coordsText
                .split(/\s+/)
                .map((coord) => {
                  const [lng, lat] = coord.split(",").map(Number);
                  return [lng, lat];
                })
                .filter((coord): coord is [number, number] => !isNaN(coord[0] ?? NaN) && !isNaN(coord[1] ?? NaN));
              
              if (coordinates.length > 0) {
                features.push({
                  type: "Feature",
                  properties: { name, description },
                  geometry: {
                    type: "Polygon",
                    coordinates: [coordinates],
                  },
                });
              }
            }
          }
        }
      }
    }
    
    return {
      type: "FeatureCollection",
      features,
    };
  };

  const handleLoadKML = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let kmlText: string;

      // Check if file is KMZ (compressed) or KML
      if (file.name.toLowerCase().endsWith(".kmz")) {
        // Handle KMZ - it's a ZIP file containing KML
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // Find the main KML file (usually doc.kml or first .kml file)
        let kmlFile = zipContent.file("doc.kml");
        if (!kmlFile) {
          // Find any .kml file
          const kmlFiles = Object.keys(zipContent.files).filter((name) =>
            name.toLowerCase().endsWith(".kml")
          );
          const firstKmlFile = kmlFiles[0];
          if (!firstKmlFile) {
            throw new Error("No KML file found in KMZ archive");
          }
          kmlFile = zipContent.file(firstKmlFile);
        }

        if (!kmlFile) {
          throw new Error("Could not read KML from KMZ");
        }

        kmlText = await kmlFile.async("text");
      } else {
        // Handle regular KML file
        kmlText = await file.text();
      }

      const geojson = parseKMLToGeoJSON(kmlText);

      if (!mapRef.current) {
        alert("Map not initialized yet. Please wait and try again.");
        return;
      }

      const map = mapRef.current;

      // Remove existing KML layer if any
      if (map.getLayer("kml-fill")) map.removeLayer("kml-fill");
      if (map.getLayer("kml-line")) map.removeLayer("kml-line");
      if (map.getLayer("kml-points")) map.removeLayer("kml-points");
      if (map.getSource("kml-data")) map.removeSource("kml-data");

      // Add new KML data
      map.addSource("kml-data", {
        type: "geojson",
        data: geojson,
      });

      // Add polygon fill layer
      map.addLayer({
        id: "kml-fill",
        type: "fill",
        source: "kml-data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0.3,
        },
      });

      // Add line layer
      map.addLayer({
        id: "kml-line",
        type: "line",
        source: "kml-data",
        filter: ["in", "$type", "LineString", "Polygon"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 2,
        },
      });

      // Add points layer
      map.addLayer({
        id: "kml-points",
        type: "circle",
        source: "kml-data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Fit map to KML bounds
      if (geojson.features.length > 0) {
        const maplibregl = await import("maplibre-gl");
        const bounds = geojson.features.reduce(
          (bounds, feature) => {
            const geometry = feature.geometry;
            if (geometry.type === "Point") {
              bounds.extend(geometry.coordinates as [number, number]);
            } else if (geometry.type === "LineString") {
              geometry.coordinates.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            } else if (geometry.type === "Polygon") {
              geometry.coordinates[0]?.forEach((coord) =>
                bounds.extend(coord as [number, number])
              );
            }
            return bounds;
          },
          new maplibregl.LngLatBounds()
        );

        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }

      setUploadedFileName(file.name);
      alert(
        `Successfully loaded ${file.name}\nFound ${geojson.features.length} feature(s)`
      );
    } catch (error) {
      console.error("Error loading KML/KMZ:", error);
      alert(
        `Failed to load file: ${error instanceof Error ? error.message : "Unknown error"}\nPlease ensure it's a valid KML or KMZ format.`
      );
    }

    // Reset file input
    if (event.target) {
      event.target.value = "";
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Viewer - Full Size */}
      <div className="absolute inset-0">
        {isLoading && !loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/90">
            <div className="text-center">
              <div className="mb-2 inline-block h-8 w-8 animate-spin rounded-full border-4 border-atlas-cobalt border-t-transparent"></div>
              <p className="text-sm text-gray-600">Loading map...</p>
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
            <div className="text-center px-4">
              <p className="text-sm text-gray-600">
                Map temporarily unavailable
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Please check your internet connection and refresh
              </p>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%" }}
          role="img"
          aria-label="Interactive map of India"
        />
      </div>

      {/* Hidden file input for KML upload (can be triggered programmatically if needed) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml,.kmz"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Layers Control */}
      {!isLoading && !loadError && (
        <LayersControl
          currentLayer={currentLayer}
          onLayerChange={handleLayerChange}
        />
      )}
    </div>
  );
});
