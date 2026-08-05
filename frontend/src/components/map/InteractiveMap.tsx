"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LayersControl, type MapLayer } from "./LayersControl";
import * as turf from "@turf/turf";

interface InteractiveMapProps {
  showDatasets?: boolean;
  interactive?: boolean;
  className?: string;
}

/**
 * Interactive map component showcasing India with optional dataset overlays.
 * Features smooth animations, dataset visualization, and proper GeoJSON rendering.
 */
export function InteractiveMap({
  showDatasets = true,
  interactive = true,
  className = "",
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<MapLayer>("default");

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      try {
        const maplibregl = await import("maplibre-gl");

        if (cancelled || !containerRef.current) return;

        // Get appropriate style based on current layer
        const getMapStyle = () => {
          // Start with a minimal style that we'll build upon
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

        // Create map instance centered on India
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: getMapStyle() as any,
          center: [78.9629, 22.5937], // Center of India
          zoom: 4.2,
          pitch: 0,
          bearing: 0,
          interactive,
          attributionControl: false,
        });

        mapRef.current = map;

        // Handle map load
        map.on("load", async () => {
          if (cancelled) return;

          try {
            // Load India boundary
            const indiaResponse = await fetch("/data/india-composite.geojson");
            const indiaData = await indiaResponse.json();

            // Add India boundary source
            map.addSource("india-boundary", {
              type: "geojson",
              data: indiaData,
            });

            // Add India fill layer with glow effect
            map.addLayer({
              id: "india-fill",
              type: "fill",
              source: "india-boundary",
              paint: {
                "fill-color": "#3b82f6",
                "fill-opacity": 0.15,
              },
            });

            // Add India outline
            map.addLayer({
              id: "india-outline",
              type: "line",
              source: "india-boundary",
              paint: {
                "line-color": "#60a5fa",
                "line-width": 2,
                "line-opacity": 0.8,
              },
            });

            // Load India state boundaries
            try {
              const statesResponse = await fetch("/data/india_states.geojson");
              const statesData = await statesResponse.json();

              // Add state boundaries source
              map.addSource("india-states", {
                type: "geojson",
                data: statesData,
              });

              // Add state boundary lines
              map.addLayer({
                id: "states-borders",
                type: "line",
                source: "india-states",
                paint: {
                  "line-color": "#94a3b8",
                  "line-width": 1.5,
                  "line-opacity": 0.6,
                },
              });

              // Add state labels
              map.addLayer({
                id: "states-labels",
                type: "symbol",
                source: "india-states",
                layout: {
                  "text-field": ["get", "st_nm"],
                  "text-font": ["Open Sans Regular"],
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

            // Load and display datasets if enabled
            if (showDatasets) {
              const datasetsResponse = await fetch(
                "/data/sample-datasets.geojson"
              );
              const datasetsData = await datasetsResponse.json();

              // Add datasets source
              map.addSource("datasets", {
                type: "geojson",
                data: datasetsData,
              });

              // Add circle layer for data points
              map.addLayer({
                id: "dataset-circles",
                type: "circle",
                source: "datasets",
                paint: {
                  "circle-radius": [
                    "interpolate",
                    ["linear"],
                    ["get", "population"],
                    1000000,
                    4,
                    10000000,
                    8,
                    35000000,
                    12,
                  ],
                  "circle-color": [
                    "match",
                    ["get", "category"],
                    "urban",
                    "#f59e0b",
                    "heritage",
                    "#ec4899",
                    "industrial",
                    "#8b5cf6",
                    "#10b981",
                  ],
                  "circle-opacity": 0.8,
                  "circle-stroke-width": 2,
                  "circle-stroke-color": "#ffffff",
                  "circle-stroke-opacity": 0.6,
                },
              });

              // Add labels for major cities
              map.addLayer({
                id: "dataset-labels",
                type: "symbol",
                source: "datasets",
                layout: {
                  "text-field": ["get", "name"],
                  "text-font": ["Open Sans Regular"],
                  "text-size": 11,
                  "text-offset": [0, 1.5],
                  "text-anchor": "top",
                },
                paint: {
                  "text-color": "#ffffff",
                  "text-halo-color": "#1e293b",
                  "text-halo-width": 1.5,
                },
              });

              // Add hover effect
              if (interactive) {
                map.on("mouseenter", "dataset-circles", () => {
                  map.getCanvas().style.cursor = "pointer";
                });

                map.on("mouseleave", "dataset-circles", () => {
                  map.getCanvas().style.cursor = "";
                });

                // Add click handler for popups
                map.on("click", "dataset-circles", (e) => {
                  if (!e.features || e.features.length === 0) return;

                  const feature = e.features[0];
                  if (!feature || !feature.geometry) return;

                  const coordinates = (
                    feature.geometry as GeoJSON.Point
                  ).coordinates.slice() as [number, number];
                  const { name, type, population } = feature.properties || {};

                  // Format population
                  const popFormatted = new Intl.NumberFormat("en-IN").format(
                    population
                  );

                  new maplibregl.Popup()
                    .setLngLat(coordinates)
                    .setHTML(
                      `
                      <div style="padding: 8px; font-family: system-ui, -apple-system, sans-serif;">
                        <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #1e293b;">${name}</h3>
                        <p style="margin: 0 0 2px 0; font-size: 12px; color: #64748b;">${type}</p>
                        <p style="margin: 0; font-size: 11px; color: #94a3b8;">Population: ${popFormatted}</p>
                      </div>
                    `
                    )
                    .addTo(map);
                });
              }
            }

            // Smooth fly to animation after a brief delay
            setTimeout(() => {
              if (!cancelled && map) {
                map.flyTo({
                  center: [78.9629, 22.5937],
                  zoom: 4.5,
                  duration: 2000,
                  essential: true,
                });
              }
            }, 500);

            setIsLoaded(true);
          } catch (error) {
            console.error("Error loading map data:", error);
            if (!cancelled) setLoadError(true);
          }
        });

        map.on("error", (e) => {
          console.error("Map error:", e);
          if (!cancelled) setLoadError(true);
        });
      } catch (error) {
        console.error("Failed to initialize map:", error);
        if (!cancelled) setLoadError(true);
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
  }, [showDatasets, interactive]); // Removed currentLayer from dependencies

  // Handle layer changes
  const handleLayerChange = async (layer: MapLayer) => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Get the current style layers to preserve custom layers
    const currentLayers = map.getStyle().layers;
    const customLayers = currentLayers.filter(
      (l) =>
        l.id.startsWith("india-") ||
        l.id.startsWith("states-") ||
        l.id.startsWith("districts-") ||
        l.id.startsWith("dataset-")
    );
    
    // Get all custom sources
    const style = map.getStyle();
    const customSources: Record<string, any> = {};
    Object.keys(style.sources).forEach((sourceId) => {
      if (
        sourceId === "india-boundary" ||
        sourceId === "india-states" ||
        sourceId === "india-districts" ||
        sourceId === "datasets"
      ) {
        customSources[sourceId] = style.sources[sourceId];
      }
    });

    // Remove existing base layers (not our custom ones)
    const baseLayerIds = currentLayers
      .filter(
        (l) =>
          !l.id.startsWith("india-") &&
          !l.id.startsWith("states-") &&
          !l.id.startsWith("districts-") &&
          !l.id.startsWith("dataset-")
      )
      .map((l) => l.id);

    baseLayerIds.forEach((id) => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    });

    // Remove base sources
    const baseSources = Object.keys(style.sources).filter(
      (sourceId) =>
        sourceId !== "india-boundary" &&
        sourceId !== "india-states" &&
        sourceId !== "india-districts" &&
        sourceId !== "datasets"
    );

    baseSources.forEach((sourceId) => {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });

    // Add new base layer based on selection
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
          customLayers.length > 0 && customLayers[0]?.id ? customLayers[0].id : undefined
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
          customLayers.length > 0 && customLayers[0]?.id ? customLayers[0].id : undefined
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
          customLayers.length > 0 && customLayers[0]?.id ? customLayers[0].id : undefined
        );
        break;
    }

    setCurrentLayer(layer);
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-mist-border)] bg-spatial-navy ${className}`}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label="Interactive map of India with geospatial data"
      />

      {/* Loading overlay */}
      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-spatial-navy">
          <div className="text-center">
            <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-cloud-mist/20 border-t-cloud-mist"></div>
            <p className="text-sm text-cloud-mist/70">Loading map...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-spatial-navy">
          <div className="text-center px-4">
            <p className="text-sm text-cloud-mist/70">
              Map temporarily unavailable
            </p>
            <p className="text-xs text-cloud-mist/50 mt-2">
              The interactive map will be available in the production release
            </p>
          </div>
        </div>
      )}

      {/* Legend for datasets */}
      {showDatasets && isLoaded && !loadError && (
        <div className="absolute bottom-4 left-4 rounded-lg bg-spatial-navy/90 px-3 py-2 text-xs backdrop-blur-sm border border-cloud-mist/20">
          <p className="mb-2 font-semibold text-cloud-mist">Dataset Types</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]"></div>
              <span className="text-cloud-mist/80">Urban Centers</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ec4899]"></div>
              <span className="text-cloud-mist/80">Heritage Sites</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]"></div>
              <span className="text-cloud-mist/80">Industrial Hubs</span>
            </div>
          </div>
        </div>
      )}

      {/* Zoom controls hint */}
      {interactive && isLoaded && !loadError && (
        <div className="absolute top-4 right-4 rounded-lg bg-spatial-navy/90 px-3 py-2 text-xs text-cloud-mist/70 backdrop-blur-sm border border-cloud-mist/20">
          Click points to explore
        </div>
      )}

      {/* Layers Control */}
      {isLoaded && !loadError && (
        <LayersControl
          currentLayer={currentLayer}
          onLayerChange={handleLayerChange}
        />
      )}
    </div>
  );
}
