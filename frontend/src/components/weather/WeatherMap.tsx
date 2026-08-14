"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  fetchDailyForecast,
  fetchLocationSummary,
} from "@/lib/api-client";
import {
  fetchOpenMeteoWeather,
  fetchOpenMeteoAqi,
  openMeteoToWeatherResponse,
  openMeteoToDailyForecast,
  openMeteoToModeledAqi,
} from "@/lib/weather/openMeteoFallback";
import type { WeatherResponse, DailyForecastDay, ModeledAirQuality, CpcbStation } from "@/types/environment";
import { WeatherLayerToolbar, type WeatherLayerKey } from "@/components/weather/WeatherLayerToolbar";
import { WeatherLocationCard } from "@/components/weather/WeatherLocationCard";
import { ForecastTimeline } from "@/components/weather/ForecastTimeline";
import { MapControls } from "@/components/weather/MapControls";
import { SourceInfoBar } from "@/components/weather/SourceInfoBar";

const SATELLITE_STYLE = "https://basemaps.cartocdn.com/gl/imagery-gl/style.json";

interface ClickedLocation {
  lat: number;
  lng: number;
  name: string;
}

export default function WeatherMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeLayer, setActiveLayer] = useState<WeatherLayerKey | null>("wind");
  const [clickedLocation, setClickedLocation] = useState<ClickedLocation | null>(null);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [forecastDays, setForecastDays] = useState<DailyForecastDay[]>([]);
  const [forecastIndex, setForecastIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [modeledAqi, setModeledAqi] = useState<ModeledAirQuality | null>(null);
  const [cpcbStation, setCpcbStation] = useState<CpcbStation | null>(null);
  const [windSource] = useState("NOAA GFS");
  const [weatherSource, setWeatherSource] = useState("NOAA GFS");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: SATELLITE_STYLE,
      center: [77.5, 12.97],
      zoom: 5,
      pitch: 0,
      bearing: 0,
      maxZoom: 18,
      minZoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Map click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      setClickedLocation({
        lat,
        lng,
        name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, []);

  // Fetch weather data when location is clicked
  useEffect(() => {
    if (!clickedLocation) return;
    const controller = new AbortController();
    setIsLoading(true);

    const fetchData = async () => {
      try {
        // Try primary backend first
        try {
          const summary = await fetchLocationSummary(
            clickedLocation.lat,
            clickedLocation.lng,
            controller.signal
          );
          if (summary.weather.data) {
            setWeather({
              ...summary.weather.data,
              latitude: clickedLocation.lat,
              longitude: clickedLocation.lng,
              dataStatus: summary.weather.dataStatus || "LIVE",
              fetchedAt: summary.weather.fetchedAt || new Date().toISOString(),
            });
            setWeatherSource("NOAA GFS");
          }
          if (summary.officialAirQuality.data) {
            setCpcbStation(summary.officialAirQuality.data);
          }
          if (summary.modeledAirQuality.data) {
            setModeledAqi(summary.modeledAirQuality.data);
          }
        } catch {
          // Fallback to Open-Meteo
          const [meteoWeather, meteoAqi] = await Promise.all([
            fetchOpenMeteoWeather(clickedLocation.lat, clickedLocation.lng, controller.signal),
            fetchOpenMeteoAqi(clickedLocation.lat, clickedLocation.lng, controller.signal),
          ]);
          const weatherResp = openMeteoToWeatherResponse(meteoWeather);
          setWeather({
            ...weatherResp,
            latitude: clickedLocation.lat,
            longitude: clickedLocation.lng,
          });
          setForecastDays(openMeteoToDailyForecast(meteoWeather));
          setModeledAqi(openMeteoToModeledAqi(meteoAqi, clickedLocation.lat, clickedLocation.lng));
          setWeatherSource("Open-Meteo (fallback)");
          setCpcbStation(null);
        }

        // Try to get forecast from primary backend
        try {
          const forecast = await fetchDailyForecast(
            clickedLocation.lat,
            clickedLocation.lng,
            controller.signal
          );
          if (forecast.days?.length > 0) {
            setForecastDays(forecast.days);
          }
        } catch {
          // forecast may already be set from Open-Meteo fallback
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [clickedLocation]);

  // Auto-play forecast timeline
  useEffect(() => {
    if (!isPlaying || forecastDays.length === 0) return;
    const interval = setInterval(() => {
      setForecastIndex((prev) => {
        if (prev >= forecastDays.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [isPlaying, forecastDays.length]);

  // Map control handlers
  const handleSearchSelect = useCallback((lat: number, lng: number, name: string) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 10, duration: 1500 });
    setClickedLocation({ lat, lng, name });
  }, []);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 10, duration: 1500 });
        setClickedLocation({ lat: latitude, lng: longitude, name: "My Location" });
      },
      () => {
        // Geolocation denied
      }
    );
  }, []);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 });
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-900">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Layer toolbar — top-left */}
      <div className="absolute top-4 left-4 z-30">
        <WeatherLayerToolbar activeLayer={activeLayer} onLayerSelect={setActiveLayer} />
      </div>

      {/* Map controls — top-right */}
      <div className="absolute top-4 right-4 z-30">
        <MapControls
          onSearchSelect={handleSearchSelect}
          onLocateMe={handleLocateMe}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onToggleFullscreen={handleToggleFullscreen}
        />
      </div>

      {/* Source info — bottom-left above timeline */}
      <div className="absolute bottom-20 left-4 z-30">
        <SourceInfoBar windSource={windSource} weatherSource={weatherSource} />
      </div>

      {/* Forecast timeline — bottom center */}
      <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
        <ForecastTimeline
          days={forecastDays}
          activeIndex={forecastIndex}
          onIndexChange={setForecastIndex}
          isPlaying={isPlaying}
          onPlayToggle={() => setIsPlaying((p) => !p)}
        />
      </div>

      {/* Weather location card — right panel */}
      {clickedLocation && (
        <div className="absolute top-4 right-100 z-30 max-h-[calc(100vh-100px)]">
          <WeatherLocationCard
            latitude={clickedLocation.lat}
            longitude={clickedLocation.lng}
            locationName={clickedLocation.name}
            weather={weather}
            modeledAqi={modeledAqi}
            cpcbStation={cpcbStation}
            onClose={() => {
              setClickedLocation(null);
              setWeather(null);
              setModeledAqi(null);
              setCpcbStation(null);
            }}
          />
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute bottom-28 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-xl bg-white/90 px-4 py-2 shadow-lg backdrop-blur-md">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm text-gray-600">Loading weather data...</span>
          </div>
        </div>
      )}

      {/* App title */}
      <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white/70 px-4 py-2 shadow-md backdrop-blur-md">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-600">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="text-sm font-bold text-gray-800">Naksha Weather</span>
        </div>
      </div>
    </div>
  );
}
