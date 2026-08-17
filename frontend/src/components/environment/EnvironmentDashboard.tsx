"use client";

import { useEffect, useState } from "react";
import { AqiStationsMap } from "@/components/environment/AqiStationsMap";
import { LocationEnvironmentPanel } from "@/components/environment/LocationEnvironmentPanel";
import {
  AirQualityBadge,
  AqiSourceTabs,
  DailyForecastRow,
  PollutantMetric,
  WeatherCurrentHero,
  WeatherHourlyChart,
  WeatherMetricGrid,
  WeatherSkeleton,
  WeatherSourceLabel,
  WeatherTabs,
  WeatherUnavailableNote,
  useAqiSourceTab,
  useWeatherTab,
  type DailyForecastItem,
  type HourlyPoint,
} from "@/components/weather/WeatherUI";
import {
  ApiUnavailableError,
  fetchDailyForecast,
  fetchHourlyForecast,
  fetchLocationSummary,
} from "@/lib/api-client";
import { formatIstTime } from "@/lib/environmentFormat";
import { getStoredUserLocation } from "@/lib/userSession";
import type { DailyForecastResponse, HourlyForecastResponse, LocationSummaryResponse } from "@/types/environment";

// Default dashboard view only — every card and the map itself work for any
// valid coordinate; click the map to look up weather/AQI anywhere.
const DEFAULT_LOCATION = { latitude: 12.9716, longitude: 77.5946 };
const DEFAULT_LOCATION_LABEL = "Bengaluru, Karnataka";

export interface EnvironmentDashboardProps {
  latitude?: number;
  longitude?: number;
}

function hourLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: true, timeZone: "Asia/Kolkata" }).format(
      new Date(iso)
    );
  } catch {
    return "";
  }
}

function dayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type LoadState = "loading" | "loaded" | "unavailable";

export function EnvironmentDashboard({ latitude, longitude }: EnvironmentDashboardProps) {
  const [selected, setSelected] = useState<{ latitude: number; longitude: number } | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState(() => ({
    latitude: latitude ?? DEFAULT_LOCATION.latitude,
    longitude: longitude ?? DEFAULT_LOCATION.longitude,
  }));
  const [locationLabel, setLocationLabel] = useState<string | null>(
    typeof latitude === "number" ? null : DEFAULT_LOCATION_LABEL
  );

  useEffect(() => {
    if (typeof latitude === "number" && typeof longitude === "number") {
      setResolvedLocation({ latitude, longitude });
      setLocationLabel(null);
      return;
    }

    const saved = getStoredUserLocation();
    if (saved) {
      setResolvedLocation({ latitude: saved.latitude, longitude: saved.longitude });
      setLocationLabel(null);
      return;
    }

    setResolvedLocation(DEFAULT_LOCATION);
    setLocationLabel(DEFAULT_LOCATION_LABEL);
  }, [latitude, longitude]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<LocationSummaryResponse | null>(null);
  const [hourly, setHourly] = useState<HourlyForecastResponse | null>(null);
  const [daily, setDaily] = useState<DailyForecastResponse | null>(null);
  const [activeTab, setActiveTab] = useWeatherTab("temperature");
  const [aqiTab, setAqiTab] = useAqiSourceTab("official");

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setHourly(null);
    setDaily(null);

    fetchLocationSummary(resolvedLocation.latitude, resolvedLocation.longitude, controller.signal)
      .then((data) => {
        setSummary(data);
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiUnavailableError || (error as Error)?.name !== "AbortError") {
          setLoadState("unavailable");
        }
      });

    fetchHourlyForecast(resolvedLocation.latitude, resolvedLocation.longitude, controller.signal)
      .then(setHourly)
      .catch(() => {});
    fetchDailyForecast(resolvedLocation.latitude, resolvedLocation.longitude, controller.signal)
      .then(setDaily)
      .catch(() => {});

    return () => controller.abort();
  }, [resolvedLocation.latitude, resolvedLocation.longitude]);

  const weather = summary?.weather.status === "AVAILABLE" ? summary.weather.data : null;
  const today = daily?.days[0];

  const hourlyPoints: HourlyPoint[] =
    hourly?.points.slice(0, 24).map((p) => ({
      label: hourLabel(p.time),
      value:
        activeTab === "temperature"
          ? p.temperatureC
          : activeTab === "precipitation"
            ? p.precipitationProbabilityPercent
            : p.windSpeedKmh,
    })) ?? [];

  const forecastItems: DailyForecastItem[] =
    daily?.days.slice(0, 7).map((d) => ({
      dayLabel: dayLabel(d.date),
      code: d.weatherCode,
      highC: d.temperatureMaxC,
      lowC: d.temperatureMinC,
      precipitationProbability: d.precipitationProbabilityMax,
    })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-obsidian-graphite">Weather &amp; Air Quality</h2>
        {locationLabel && <p className="text-sm text-obsidian-graphite">{locationLabel}</p>}
        <p className="text-xs text-[var(--color-text-secondary)]">
          {resolvedLocation.latitude.toFixed(4)}, {resolvedLocation.longitude.toFixed(4)}
        </p>
      </div>

      <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-6 shadow-card">
        {loadState === "loading" && <WeatherSkeleton lines={4} />}

        {loadState === "unavailable" && (
          <WeatherUnavailableNote>Weather is temporarily unavailable for this location.</WeatherUnavailableNote>
        )}

        {loadState === "loaded" && summary && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {/* Current weather hero + summary metrics */}
            <div>
              {weather ? (
                <>
                  <WeatherCurrentHero
                    temperatureC={weather.temperatureC}
                    feelsLikeC={weather.feelsLikeC}
                    code={weather.weatherCode}
                    isDay={weather.isDay}
                    windSpeedKmh={weather.windSpeedKmh}
                    highC={today?.temperatureMaxC}
                    lowC={today?.temperatureMinC}
                    updatedLabel={formatIstTime(weather.observationTime)}
                  />
                  <div className="mt-5">
                    <WeatherMetricGrid
                      precipitation={weather.precipitationMm != null ? `${weather.precipitationMm} mm` : null}
                      humidity={weather.relativeHumidityPercent != null ? `${weather.relativeHumidityPercent}%` : null}
                      windSpeedKmh={weather.windSpeedKmh}
                      windDirectionCompass={weather.windDirectionCompass}
                      pressureHpa={weather.surfacePressureHpa}
                      className="grid-cols-2"
                    />
                  </div>
                  <WeatherSourceLabel source={weather.source} className="mt-3" />
                </>
              ) : (
                <WeatherUnavailableNote>
                  {summary.weather.message ?? "Live weather is temporarily unavailable."}
                </WeatherUnavailableNote>
              )}
            </div>

            {/* Hourly chart + 7-day forecast */}
            <div>
              <WeatherTabs active={activeTab} onChange={setActiveTab} />
              {hourly ? (
                <WeatherHourlyChart
                  points={hourlyPoints}
                  unit={activeTab === "temperature" ? "°C" : activeTab === "precipitation" ? "%" : "km/h"}
                  variant={activeTab === "precipitation" ? "bars" : "line"}
                  className="mt-3"
                />
              ) : (
                <div className="mt-3 h-[100px] animate-pulse rounded-lg bg-gray-50" />
              )}
              {forecastItems.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    7-Day Forecast
                  </p>
                  <DailyForecastRow days={forecastItems} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Official + modeled air quality, tabbed so they don't double the section's height */}
      {loadState === "loaded" && summary && (
        <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-obsidian-graphite">Air Quality</h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {aqiTab === "official" ? "CPCB / data.gov.in" : "Open-Meteo · Modeled"}
            </span>
          </div>
          <AqiSourceTabs active={aqiTab} onChange={setAqiTab} className="mb-3 max-w-xs" />

          {aqiTab === "official" ? (
            summary.officialAirQuality.status === "AVAILABLE" && summary.officialAirQuality.data ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <AirQualityBadge
                    category={summary.officialAirQuality.data.aqiCategory}
                    value={summary.officialAirQuality.data.aqiValue}
                  />
                </div>
                <p className="mb-3 text-sm text-obsidian-graphite">
                  Nearest station:{" "}
                  <span className="font-medium">
                    {summary.officialAirQuality.data.city} — {summary.officialAirQuality.data.station}
                  </span>
                  {summary.officialAirQuality.distanceKm != null && (
                    <span className="text-[var(--color-text-secondary)]">
                      {" "}
                      ({summary.officialAirQuality.distanceKm} km away)
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"].map((key) => {
                    const reading = summary.officialAirQuality.data!.pollutants[key];
                    return (
                      <PollutantMetric key={key} label={key} value={reading?.avg != null ? `${reading.avg} µg/m³` : "—"} />
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-[var(--color-text-secondary)]">
                  Last observation: {formatIstTime(summary.officialAirQuality.data.lastUpdate)}
                </p>
              </div>
            ) : (
              <WeatherUnavailableNote>{summary.officialAirQuality.message ?? "AQI Not Available"}</WeatherUnavailableNote>
            )
          ) : summary.modeledAirQuality.status === "AVAILABLE" && summary.modeledAirQuality.data ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                {summary.modeledAirQuality.data.usAqi != null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    US AQI {Math.round(summary.modeledAirQuality.data.usAqi)}
                  </span>
                )}
                {summary.modeledAirQuality.data.europeanAqi != null && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    EU AQI {Math.round(summary.modeledAirQuality.data.europeanAqi)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <PollutantMetric label="PM2.5" value={summary.modeledAirQuality.data.pm2_5 != null ? `${summary.modeledAirQuality.data.pm2_5} µg/m³` : "—"} />
                <PollutantMetric label="PM10" value={summary.modeledAirQuality.data.pm10 != null ? `${summary.modeledAirQuality.data.pm10} µg/m³` : "—"} />
                <PollutantMetric label="CO" value={summary.modeledAirQuality.data.co != null ? `${summary.modeledAirQuality.data.co} µg/m³` : "—"} />
                <PollutantMetric label="NO2" value={summary.modeledAirQuality.data.no2 != null ? `${summary.modeledAirQuality.data.no2} µg/m³` : "—"} />
                <PollutantMetric label="SO2" value={summary.modeledAirQuality.data.so2 != null ? `${summary.modeledAirQuality.data.so2} µg/m³` : "—"} />
                <PollutantMetric label="O3" value={summary.modeledAirQuality.data.o3 != null ? `${summary.modeledAirQuality.data.o3} µg/m³` : "—"} />
              </div>
              <p className="mt-3 text-[11px] text-[var(--color-text-secondary)]">
                Observed: {formatIstTime(summary.modeledAirQuality.data.observationTime)} · Modeled / gridded
              </p>
            </div>
          ) : (
            <WeatherUnavailableNote>
              {summary.modeledAirQuality.message ?? "Modeled air-quality information is temporarily unavailable."}
            </WeatherUnavailableNote>
          )}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-obsidian-graphite">Karnataka AQI Map</h3>
        <AqiStationsMap
          className="h-[420px]"
          onLocationSelect={(lat, lon) => setSelected({ latitude: lat, longitude: lon })}
        />
      </div>

      {selected && (
        <LocationEnvironmentPanel
          latitude={selected.latitude}
          longitude={selected.longitude}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
