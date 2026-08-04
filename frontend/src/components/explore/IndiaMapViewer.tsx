"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export function IndiaMapViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      try {
        // Initialize MapLibre with OpenStreetMap tiles
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        // High-quality satellite imagery with accurate labels
        // Prefers Mapbox (if API key available), falls back to ESRI + OpenStreetMap labels
        
        const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        
        let mapStyle;
        
        if (mapboxToken) {
          // Option 1: Mapbox Satellite Streets (BEST - accurate labels, high quality)
          mapStyle = {
            version: 8,
            sources: {
              "mapbox-satellite": {
                type: "raster",
                tiles: [
                  `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg?access_token=${mapboxToken}`,
                ],
                tileSize: 256,
                attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
              },
              "mapbox-labels": {
                type: "raster",
                tiles: [
                  `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
                ],
                tileSize: 512,
                attribution: '',
              },
            },
            layers: [
              {
                id: "mapbox-satellite",
                type: "raster",
                source: "mapbox-satellite",
                minzoom: 0,
                maxzoom: 22,
              },
            ],
          };
        } else {
          // Option 2: Free alternative - ESRI Satellite only (clean, no labels)
          // This avoids incorrect label issues - pure satellite view
          mapStyle = {
            version: 8,
            sources: {
              "satellite": {
                type: "raster",
                tiles: [
                  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                ],
                tileSize: 256,
                attribution: 'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
              },
            },
            layers: [
              {
                id: "satellite",
                type: "raster",
                source: "satellite",
                minzoom: 0,
                maxzoom: 22,
              },
            ],
          };
        }
        
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: mapStyle,
          center: [78.9629, 20.5937], // Center of India
          zoom: 4.5,
          attributionControl: true,
        });

        mapRef.current = map;

        // Add navigation controls
        map.addControl(
          new maplibregl.NavigationControl({
            showCompass: true,
            showZoom: true,
          }),
          "top-right"
        );

        map.on("load", () => {
          if (cancelled) return;
          setIsLoading(false);
          
          // Auto-load Karnataka State boundary from MinIO
          loadKarnatakaStateFromMinIO(map);
        });

        map.on("error", (e) => {
          console.error("Map error:", e);
          if (!cancelled) {
            setLoadError(true);
            setIsLoading(false);
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
  }, []);

  // Function to auto-load Karnataka State boundary from MinIO
  const loadKarnatakaStateFromMinIO = async (map: MapLibreMap) => {
    try {
      console.log("Auto-loading Karnataka State boundary from MinIO...");
      
      // Fetch KMZ from our Next.js API route (which proxies to backend → MinIO)
      const response = await fetch('/api/datasets/karnataka-boundary-kmz');
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch KMZ:', errorData);
        return; // Fail silently, user can still use manual upload
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
        if (kmlFiles.length === 0) {
          throw new Error("No KML file found in KMZ archive");
        }
        kmlFile = zipContent.file(kmlFiles[0]);
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
              geometry.coordinates[0].forEach((coord) =>
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
              coordinates: [lng, lat],
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
            .filter((coord) => !isNaN(coord[0]) && !isNaN(coord[1]));
          
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
                .filter((coord) => !isNaN(coord[0]) && !isNaN(coord[1]));
              
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
          if (kmlFiles.length === 0) {
            throw new Error("No KML file found in KMZ archive");
          }
          kmlFile = zipContent.file(kmlFiles[0]);
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
              geometry.coordinates[0].forEach((coord) =>
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
    </div>
  );
}
