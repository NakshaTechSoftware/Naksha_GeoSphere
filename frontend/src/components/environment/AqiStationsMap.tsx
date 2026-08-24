"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapMouseEvent, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchAirQuality, fetchAqiStationsGeoJson, fetchWeather } from "@/lib/api-client";
import type { AirQualityResponse, WeatherResponse } from "@/types/environment";

const KARNATAKA_CENTER: [number, number] = [75.7139, 15.3173];

interface CategoryColorMap {
  Good: string;
  Satisfactory: string;
  Moderate: string;
  Poor: string;
  "Very Poor": string;
  Severe: string;
}

const CATEGORY_COLORS: CategoryColorMap = {
  Good: "#10b981",
  Satisfactory: "#84cc16",
  Moderate: "#f59e0b",
  Poor: "#f97316",
  "Very Poor": "#ef4444",
  Severe: "#991b1b",
};
const UNKNOWN_COLOR = "#94a3b8";

type AsyncSection<T> = { status: "loading" } | { status: "unavailable" } | { status: "loaded"; data: T };

// Builds the station popup's HTML: the CPCB reading (always known immediately
// from the GeoJSON properties) plus Weather and Modeled Air Quality sections
// for that station's exact coordinates (spec section L), each clearly
// labeled with its own source so a measured CPCB reading is never confused
// with Open-Meteo's modeled estimate for the same point.
function buildStationPopupHtml(
  props: Record<string, unknown>,
  weather: AsyncSection<WeatherResponse>,
  airQuality: AsyncSection<AirQualityResponse>,
): string {
  const pollutants =
    typeof props.pollutants === "string"
      ? (JSON.parse(props.pollutants) as Record<string, { avg?: number }>)
      : ((props.pollutants as Record<string, { avg?: number }>) ?? {});
  const pollutantLine = (key: string) =>
    pollutants[key]?.avg != null ? `${key}: ${pollutants[key]!.avg} µg/m³` : null;
  const pollutantRows = [
    pollutantLine("PM2.5"),
    pollutantLine("PM10"),
    pollutantLine("NO2"),
    pollutantLine("SO2"),
    pollutantLine("CO"),
    pollutantLine("O3"),
    pollutantLine("NH3"),
  ]
    .filter(Boolean)
    .map((row) => `<div style="font-size:11px;color:#475569;">${row}</div>`)
    .join("");

  const sectionHeading = (label: string) =>
    `<p style="margin:8px 0 3px 0;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:6px;">${label}</p>`;

  let weatherHtml: string;
  if (weather.status === "loading") {
    weatherHtml = `<p style="margin:0;font-size:11px;color:#94a3b8;">Loading weather…</p>`;
  } else if (weather.status === "unavailable") {
    weatherHtml = `<p style="margin:0;font-size:11px;color:#94a3b8;">Live weather is temporarily unavailable.</p>`;
  } else {
    const w = weather.data;
    weatherHtml = `
      <div style="font-size:11px;color:#475569;">Temperature: ${w.temperatureC ?? "—"} °C</div>
      <div style="font-size:11px;color:#475569;">Humidity: ${w.relativeHumidityPercent ?? "—"} %</div>
      <div style="font-size:11px;color:#475569;">Rain: ${w.rainMm ?? "—"} mm</div>
      <div style="font-size:11px;color:#475569;">Wind: ${w.windSpeedKmh ?? "—"} km/h${w.windDirectionCompass ? ` (${w.windDirectionCompass})` : ""}</div>
      <div style="font-size:11px;color:#475569;">Pressure: ${w.surfacePressureHpa ?? "—"} hPa</div>
      <div style="margin-top:2px;font-size:10px;color:#94a3b8;">Source: Open-Meteo</div>`;
  }

  let aqHtml: string;
  if (airQuality.status === "loading") {
    aqHtml = `<p style="margin:0;font-size:11px;color:#94a3b8;">Loading modeled air quality…</p>`;
  } else if (airQuality.status === "unavailable") {
    aqHtml = `<p style="margin:0;font-size:11px;color:#94a3b8;">Modeled air-quality information is temporarily unavailable.</p>`;
  } else {
    const a = airQuality.data;
    aqHtml = `
      <div style="font-size:11px;color:#475569;">PM2.5: ${a.pm2_5 ?? "—"} µg/m³ · PM10: ${a.pm10 ?? "—"} µg/m³</div>
      <div style="font-size:11px;color:#475569;">NO2: ${a.no2 ?? "—"} · SO2: ${a.so2 ?? "—"} · CO: ${a.co ?? "—"} · O3: ${a.o3 ?? "—"} µg/m³</div>
      <div style="font-size:11px;color:#475569;">US AQI: ${a.usAqi ?? "—"} · European AQI: ${a.europeanAqi ?? "—"}</div>
      <div style="margin-top:2px;font-size:10px;color:#94a3b8;">Source: Open-Meteo · Modeled (not an official CPCB reading)</div>`;
  }

  return `<div style="padding:8px;font-family:system-ui,-apple-system,sans-serif;min-width:200px;max-width:240px;">
     <h3 style="margin:0 0 2px 0;font-size:13px;font-weight:600;color:#1e293b;">${props.station ?? "Station"}</h3>
     <p style="margin:0 0 6px 0;font-size:11px;color:#64748b;">${props.city ?? ""}</p>
     ${sectionHeading("Official Air Quality · CPCB")}
     <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#1e293b;">
       AQI: ${props.aqi ?? "Not available"} ${props.aqi_category ? `(${props.aqi_category})` : ""}
     </p>
     ${pollutantRows}
     <p style="margin:4px 0 0 0;font-size:10px;color:#94a3b8;">
       ${props.last_update ? new Date(String(props.last_update)).toLocaleString("en-IN") : ""}<br/>
       Source: ${props.source ?? "CPCB / data.gov.in"} · Measured
     </p>
     ${sectionHeading("Live Weather · Open-Meteo")}
     ${weatherHtml}
     ${sectionHeading("Modeled Air Quality · Open-Meteo")}
     ${aqHtml}
   </div>`;
}

export interface AqiStationsMapProps {
  className?: string;
  /** Called when the user clicks a blank part of the map — lets a parent
   * show a LocationEnvironmentPanel for that coordinate (spec section M). */
  onLocationSelect?: (latitude: number, longitude: number) => void;
}

/**
 * Karnataka AQI map (spec sections K/L/N): shows CPCB monitoring stations
 * as an optional, toggleable layer with click-to-inspect popups, and lets
 * the user click anywhere else to look up weather/modeled air quality for
 * that point — without replacing or touching the main Explore map.
 */
export function AqiStationsMap({ className = "", onLocationSelect }: AqiStationsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showStations, setShowStations] = useState(true);
  const [stationCount, setStationCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
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
            layers: [{ id: "osm-layer", type: "raster", source: "osm-tiles" }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
          center: KARNATAKA_CENTER,
          zoom: 6.4,
          attributionControl: false,
        });
        mapRef.current = map;

        map.on("load", async () => {
          if (cancelled) return;
          try {
            const geojson = await fetchAqiStationsGeoJson();
            if (cancelled || !map.getContainer()) return;

            map.addSource("aqi-stations", { type: "geojson", data: geojson as GeoJSON.GeoJSON });
            map.addLayer({
              id: "aqi-stations-circles",
              type: "circle",
              source: "aqi-stations",
              paint: {
                "circle-radius": 7,
                "circle-color": [
                  "match",
                  ["get", "aqi_category"],
                  "Good",
                  CATEGORY_COLORS.Good,
                  "Satisfactory",
                  CATEGORY_COLORS.Satisfactory,
                  "Moderate",
                  CATEGORY_COLORS.Moderate,
                  "Poor",
                  CATEGORY_COLORS.Poor,
                  "Very Poor",
                  CATEGORY_COLORS["Very Poor"],
                  "Severe",
                  CATEGORY_COLORS.Severe,
                  UNKNOWN_COLOR,
                ],
                "circle-opacity": 0.9,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              },
            });

            setStationCount(geojson.features.length);

            map.on("mouseenter", "aqi-stations-circles", () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", "aqi-stations-circles", () => {
              map.getCanvas().style.cursor = "";
            });

            map.on("click", "aqi-stations-circles", (e) => {
              const feature = e.features?.[0];
              if (!feature || feature.geometry.type !== "Point") return;
              const [lng, lat] = feature.geometry.coordinates as [number, number];
              const props = (feature.properties ?? {}) as Record<string, unknown>;

              let weatherSection: AsyncSection<WeatherResponse> = { status: "loading" };
              let airQualitySection: AsyncSection<AirQualityResponse> = { status: "loading" };

              const popup: Popup = new maplibregl.Popup()
                .setLngLat([lng, lat])
                .setHTML(buildStationPopupHtml(props, weatherSection, airQualitySection))
                .addTo(map);

              // Popup content is a static HTML string, not a live-bound React
              // tree - each fetch resolution re-renders the whole HTML and
              // calls setHTML() again while the popup stays open. If the user
              // closes the popup before a fetch resolves, `popup.isOpen()`
              // guards against updating a detached popup.
              fetchWeather(lat, lng)
                .then((data) => {
                  weatherSection = { status: "loaded", data };
                })
                .catch(() => {
                  weatherSection = { status: "unavailable" };
                })
                .finally(() => {
                  if (popup.isOpen()) popup.setHTML(buildStationPopupHtml(props, weatherSection, airQualitySection));
                });

              fetchAirQuality(lat, lng)
                .then((data) => {
                  airQualitySection = { status: "loaded", data };
                })
                .catch(() => {
                  airQualitySection = { status: "unavailable" };
                })
                .finally(() => {
                  if (popup.isOpen()) popup.setHTML(buildStationPopupHtml(props, weatherSection, airQualitySection));
                });
            });

            setIsLoaded(true);
          } catch {
            if (!cancelled) setLoadError(true);
          }
        });

        map.on("error", () => {
          if (!cancelled) setLoadError(true);
        });

        // Click-anywhere-for-weather: only fires when the click did not
        // land on a station circle (that click is handled above instead).
        map.on("click", (e: MapMouseEvent) => {
          if (!onLocationSelectRef.current) return;
          const hits = map.queryRenderedFeatures(e.point, {
            layers: map.getLayer("aqi-stations-circles") ? ["aqi-stations-circles"] : [],
          });
          if (hits.length > 0) return;
          onLocationSelectRef.current(e.lngLat.lat, e.lngLat.lng);
        });
      } catch {
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
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("aqi-stations-circles")) return;
    map.setLayoutProperty("aqi-stations-circles", "visibility", showStations ? "visible" : "none");
  }, [showStations]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-mist-border)] bg-spatial-navy ${className}`}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label="Karnataka CPCB air-quality monitoring stations map"
      />

      {!isLoaded && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-spatial-navy">
          <div className="text-center">
            <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-4 border-cloud-mist/20 border-t-cloud-mist" />
            <p className="text-sm text-cloud-mist/70" role="status">
              Loading AQI stations…
            </p>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-spatial-navy">
          <p className="text-sm text-cloud-mist/70">Map temporarily unavailable</p>
        </div>
      )}

      {isLoaded && !loadError && (
        <div className="absolute left-4 top-4 rounded-lg bg-spatial-navy/90 px-3 py-2 text-xs backdrop-blur-sm border border-cloud-mist/20">
          <label className="flex items-center gap-2 text-cloud-mist/80">
            <input
              type="checkbox"
              className="accent-atlas-cobalt"
              checked={showStations}
              onChange={(e) => setShowStations(e.target.checked)}
            />
            Live AQI Stations {stationCount !== null ? `(${stationCount})` : ""}
          </label>
          <p className="mt-1 text-[10px] text-cloud-mist/50">Click a station or anywhere on the map</p>
        </div>
      )}
    </div>
  );
}
