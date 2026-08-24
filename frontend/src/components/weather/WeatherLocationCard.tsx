"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";
import type { WeatherResponse, ModeledAirQuality, CpcbStation } from "@/types/environment";
import {
  XIcon,
  StarIcon,
  HomeIcon,
  MapPinIcon,
  ThermometerIcon,
  DropletsIcon,
  CloudRainIcon,
  WindIcon,
  GaugeIcon,
  ClockIcon,
  ArrowRightIcon,
  SunIcon,
  PartlyCloudyIcon,
  CloudyIcon,
  RainIcon,
  StormIcon,
} from "./WeatherIcons";

function getWeatherIcon(code: number | null, size = 64) {
  if (code == null) return <CloudyIcon size={size} />;
  if (code === 0) return <SunIcon size={size} />;
  if (code <= 3) return <PartlyCloudyIcon size={size} />;
  if (code <= 49) return <CloudyIcon size={size} />;
  if (code <= 69) return <RainIcon size={size} />;
  if (code <= 82) return <RainIcon size={size} />;
  return <StormIcon size={size} />;
}

function getWeatherCondition(code: number | null): string {
  if (code == null) return "Unknown";
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Overcast";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snowfall";
  if (code <= 82) return "Rain showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "—";
  }
}

function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

interface WeatherLocationCardProps {
  latitude: number;
  longitude: number;
  locationName?: string;
  weather: WeatherResponse | null;
  modeledAqi: ModeledAirQuality | null;
  cpcbStation: CpcbStation | null;
  onClose: () => void;
  className?: string;
}

export function WeatherLocationCard({
  latitude,
  longitude,
  locationName,
  weather,
  modeledAqi,
  cpcbStation,
  onClose,
  className,
}: WeatherLocationCardProps) {
  const [useFahrenheit, setUseFahrenheit] = useState(false);

  const tempC = weather?.temperatureC;
  const tempDisplay = tempC != null ? (useFahrenheit ? (tempC * 9) / 5 + 32 : tempC) : null;
  const tempUnit = useFahrenheit ? "°F" : "°C";
  const weatherCode = weather?.temperatureC != null ? 0 : null;

  return (
    <div
      className={cn(
        "w-[380px] max-h-[calc(100vh-120px)] overflow-y-auto rounded-3xl border border-white/40 bg-white/80 shadow-2xl backdrop-blur-xl",
        className
      )}
    >
      {/* Header */}
      <div className="relative px-5 pt-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <MapPinIcon size={16} className="text-blue-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900 truncate">
                {locationName || "Selected Location"}
              </h2>
            </div>
            <p className="mt-0.5 pl-6 text-xs text-gray-500 font-mono">
              {formatCoord(latitude, longitude)}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-amber-500 transition-colors" title="Favorite">
              <StarIcon size={18} />
            </button>
            <button className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-500 transition-colors" title="Home">
              <HomeIcon size={18} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" title="Close">
              <XIcon size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main weather display */}
      <div className="px-5 pb-4">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            {getWeatherIcon(weatherCode, 72)}
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              {tempDisplay != null ? (
                <span className="text-5xl font-bold tracking-tight text-gray-900">
                  {tempDisplay.toFixed(1)}
                </span>
              ) : (
                <span className="text-5xl font-bold tracking-tight text-gray-300">—</span>
              )}
              <button
                onClick={() => setUseFahrenheit((f) => !f)}
                className="text-lg font-medium text-gray-400 hover:text-blue-500 transition-colors"
              >
                {tempUnit}
              </button>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              {getWeatherCondition(weatherCode)}
            </p>
          </div>
        </div>

        {weather?.observationTime && (
          <p className="mt-2 text-xs text-gray-400">
            As of {formatTime(weather.observationTime)} IST
          </p>
        )}

        <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500/10 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/20">
          See full forecast
          <ArrowRightIcon size={16} />
        </button>
      </div>

      {/* Metrics grid */}
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <MetricItem
            icon={<ThermometerIcon size={18} className="text-blue-500" />}
            label="Temperature"
            value={tempC != null ? `${tempC.toFixed(1)} °C` : "—"}
          />
          <MetricItem
            icon={<DropletsIcon size={18} className="text-blue-500" />}
            label="Humidity"
            value={weather?.relativeHumidityPercent != null ? `${weather.relativeHumidityPercent} %` : "—"}
          />
          <MetricItem
            icon={<CloudRainIcon size={18} className="text-blue-500" />}
            label="Rain"
            value={weather?.rainMm != null ? `${weather.rainMm} mm` : "0 mm"}
          />
          <MetricItem
            icon={<DropletsIcon size={18} className="text-blue-500" />}
            label="Precipitation"
            value={weather?.precipitationMm != null ? `${weather.precipitationMm} mm` : "0 mm"}
          />
          <MetricItem
            icon={<WindIcon size={18} className="text-blue-500" />}
            label="Wind"
            value={weather?.windSpeedKmh != null ? `${weather.windSpeedKmh} km/h` : "—"}
          />
          <MetricItem
            icon={<MapPinIcon size={18} className="text-blue-500" />}
            label="Direction"
            value={
              weather?.windDirectionCompass && weather?.windDirectionDegrees != null
                ? `${weather.windDirectionCompass} / ${weather.windDirectionDegrees}°`
                : "—"
            }
          />
          <MetricItem
            icon={<GaugeIcon size={18} className="text-blue-500" />}
            label="Pressure"
            value={weather?.surfacePressureHpa != null ? `${weather.surfacePressureHpa} hPa` : "—"}
          />
          <MetricItem
            icon={<ClockIcon size={18} className="text-blue-500" />}
            label="Observed"
            value={weather?.observationTime ? formatTime(weather.observationTime) + " IST" : "—"}
          />
        </div>
      </div>

      {/* Air Quality */}
      {(cpcbStation || modeledAqi) && (
        <div className="border-t border-gray-100 px-5 py-4">
          {cpcbStation && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Official Air Quality
              </h3>
              <p className="text-xs text-gray-400 mb-2">
                {cpcbStation.station}, {cpcbStation.city}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <AqiMetric label="AQI" value={cpcbStation.aqiValue != null ? String(cpcbStation.aqiValue) : "Not available"} category={cpcbStation.aqiCategory} />
                <AqiMetric label="PM2.5" value={cpcbStation.pollutants.pm2_5?.avg != null ? `${cpcbStation.pollutants.pm2_5.avg} µg/m³` : "—"} />
                <AqiMetric label="PM10" value={cpcbStation.pollutants.pm10?.avg != null ? `${cpcbStation.pollutants.pm10.avg} µg/m³` : "—"} />
                <AqiMetric label="NO₂" value={cpcbStation.pollutants.no2?.avg != null ? `${cpcbStation.pollutants.no2.avg} µg/m³` : "—"} />
                <AqiMetric label="SO₂" value={cpcbStation.pollutants.so2?.avg != null ? `${cpcbStation.pollutants.so2.avg} µg/m³` : "—"} />
                <AqiMetric label="CO" value={cpcbStation.pollutants.co?.avg != null ? `${cpcbStation.pollutants.co.avg} µg/m³` : "—"} />
                <AqiMetric label="O₃" value={cpcbStation.pollutants.o3?.avg != null ? `${cpcbStation.pollutants.o3.avg} µg/m³` : "—"} />
              </div>
              <p className="mt-2 text-[10px] text-gray-400">Source: CPCB / data.gov.in</p>
            </div>
          )}

          {modeledAqi && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Modeled Air Quality
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <AqiMetric label="PM2.5" value={modeledAqi.pm2_5 != null ? `${modeledAqi.pm2_5} µg/m³` : "—"} />
                <AqiMetric label="PM10" value={modeledAqi.pm10 != null ? `${modeledAqi.pm10} µg/m³` : "—"} />
                <AqiMetric label="CO" value={modeledAqi.co != null ? `${modeledAqi.co} µg/m³` : "—"} />
                <AqiMetric label="NO₂" value={modeledAqi.no2 != null ? `${modeledAqi.no2} µg/m³` : "—"} />
                <AqiMetric label="SO₂" value={modeledAqi.so2 != null ? `${modeledAqi.so2} µg/m³` : "—"} />
                <AqiMetric label="O₃" value={modeledAqi.o3 != null ? `${modeledAqi.o3} µg/m³` : "—"} />
                <AqiMetric label="US AQI" value={modeledAqi.usAqi != null ? String(modeledAqi.usAqi) : "—"} />
                <AqiMetric label="European AQI" value={modeledAqi.europeanAqi != null ? String(modeledAqi.europeanAqi) : "—"} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-blue-50/60 px-3 py-2.5">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function AqiMetric({
  label,
  value,
  category,
}: {
  label: string;
  value: string;
  category?: string | null;
}) {
  const categoryColor = category
    ? category === "Good"
      ? "text-green-600"
      : category === "Satisfactory"
        ? "text-green-500"
        : category === "Moderate"
          ? "text-yellow-500"
          : "text-red-500"
    : "";

  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-2">
      <p className="text-[10px] font-medium text-gray-400">{label}</p>
      <p className={cn("text-sm font-semibold text-gray-700", category && categoryColor)}>
        {value}
      </p>
    </div>
  );
}
