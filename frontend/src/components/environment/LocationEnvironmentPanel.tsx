"use client";

import { useEffect, useState } from "react";
import {
  AqiSourceTabs,
  DailyForecastRow,
  AirQualityBadge,
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
import type { DailyForecastResponse, HourlyForecastResponse, LocationSummaryResponse } from "@/types/environment";

type LoadState = "loading" | "loaded" | "unavailable";

export interface LocationEnvironmentPanelProps {
  latitude: number;
  longitude: number;
  /** Optional label for the selected point, e.g. "12.9716, 77.5946" or a place name. */
  locationLabel?: string;
  onClose?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--color-border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {title}
      </h3>
      {children}
    </section>
  );
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

/**
 * The "click anywhere" / "My Environment" panel: given a coordinate, shows a
 * premium current-weather hero, an hourly Temperature/Precipitation/Wind
 * chart, a compact 7-day forecast, current-condition metrics, and the
 * official CPCB + modeled Open-Meteo air-quality sections - each visually and
 * textually separated so measured and modeled data are never confused.
 */
export function LocationEnvironmentPanel({
  latitude,
  longitude,
  locationLabel,
  onClose,
}: LocationEnvironmentPanelProps) {
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

    fetchLocationSummary(latitude, longitude, controller.signal)
      .then((data) => {
        setSummary(data);
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiUnavailableError) {
          setLoadState("unavailable");
          return;
        }
        if ((error as Error)?.name !== "AbortError") {
          setLoadState("unavailable");
        }
      });

    // Hourly/daily are independent, non-critical enhancements - if either
    // fails, the hero/AQI sections above still render (section 54).
    fetchHourlyForecast(latitude, longitude, controller.signal)
      .then(setHourly)
      .catch(() => {});
    fetchDailyForecast(latitude, longitude, controller.signal)
      .then(setDaily)
      .catch(() => {});

    return () => controller.abort();
  }, [latitude, longitude]);

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
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-obsidian-graphite">Environment</h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {locationLabel ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close environment panel"
            className="text-[var(--color-text-secondary)] hover:text-atlas-cobalt"
          >
            ×
          </button>
        )}
      </div>

      {loadState === "loading" && <WeatherSkeleton lines={4} />}

      {loadState === "unavailable" && (
        <WeatherUnavailableNote>
          Environmental information is temporarily unavailable for this location.
        </WeatherUnavailableNote>
      )}

      {loadState === "loaded" && summary && (
        <div className="space-y-3">
          <Section title="Current Weather">
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
                {summary.weather.dataStatus === "STALE" && (
                  <span className="mt-3 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                    Showing last known reading
                  </span>
                )}

                <div className="mt-3">
                  <WeatherTabs active={activeTab} onChange={setActiveTab} />

                  {activeTab === "aqi" ? (
                    <div className="mt-3">
                      <AqiSourceTabs active={aqiTab} onChange={setAqiTab} className="mb-3" />

                      {aqiTab === "official" ? (
                        summary.officialAirQuality.status === "AVAILABLE" && summary.officialAirQuality.data ? (
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <AirQualityBadge
                                category={summary.officialAirQuality.data.aqiCategory}
                                value={summary.officialAirQuality.data.aqiValue}
                              />
                              {summary.officialAirQuality.dataStatus === "STALE" && (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                  Showing last known reading
                                </span>
                              )}
                            </div>
                            <p className="mb-2 text-xs text-obsidian-graphite">
                              Nearest CPCB station:{" "}
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
                            <div className="grid grid-cols-3 gap-1.5">
                              {["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"].map((key) => {
                                const reading = summary.officialAirQuality.data!.pollutants[key];
                                return (
                                  <PollutantMetric
                                    key={key}
                                    label={key}
                                    value={reading?.avg != null ? `${reading.avg} µg/m³` : "—"}
                                  />
                                );
                              })}
                            </div>
                            <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                              Last observation: {formatIstTime(summary.officialAirQuality.data.lastUpdate)}
                            </p>
                          </div>
                        ) : (
                          <WeatherUnavailableNote>
                            {summary.officialAirQuality.message ?? "AQI Not Available"}
                          </WeatherUnavailableNote>
                        )
                      ) : summary.modeledAirQuality.status === "AVAILABLE" && summary.modeledAirQuality.data ? (
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
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
                          <div className="grid grid-cols-3 gap-1.5">
                            <PollutantMetric label="PM2.5" value={summary.modeledAirQuality.data.pm2_5 != null ? `${summary.modeledAirQuality.data.pm2_5} µg/m³` : "—"} />
                            <PollutantMetric label="PM10" value={summary.modeledAirQuality.data.pm10 != null ? `${summary.modeledAirQuality.data.pm10} µg/m³` : "—"} />
                            <PollutantMetric label="CO" value={summary.modeledAirQuality.data.co != null ? `${summary.modeledAirQuality.data.co} µg/m³` : "—"} />
                            <PollutantMetric label="NO2" value={summary.modeledAirQuality.data.no2 != null ? `${summary.modeledAirQuality.data.no2} µg/m³` : "—"} />
                            <PollutantMetric label="SO2" value={summary.modeledAirQuality.data.so2 != null ? `${summary.modeledAirQuality.data.so2} µg/m³` : "—"} />
                            <PollutantMetric label="O3" value={summary.modeledAirQuality.data.o3 != null ? `${summary.modeledAirQuality.data.o3} µg/m³` : "—"} />
                          </div>
                          <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                            Observed: {formatIstTime(summary.modeledAirQuality.data.observationTime)} · Modeled / gridded
                            (not an official CPCB station reading)
                          </p>
                        </div>
                      ) : (
                        <WeatherUnavailableNote>
                          {summary.modeledAirQuality.message ?? "Modeled air-quality information is temporarily unavailable."}
                        </WeatherUnavailableNote>
                      )}
                    </div>
                  ) : (
                    <>
                      {hourly ? (
                        <WeatherHourlyChart
                          points={hourlyPoints}
                          unit={activeTab === "temperature" ? "°C" : activeTab === "precipitation" ? "%" : "km/h"}
                          variant={activeTab === "precipitation" ? "bars" : "line"}
                          className="mt-3"
                        />
                      ) : (
                        <div className="mt-3 h-[80px] animate-pulse rounded-lg bg-gray-50" />
                      )}

                      {forecastItems.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                            7-Day Forecast
                          </p>
                          <DailyForecastRow days={forecastItems} />
                        </div>
                      )}

                      <div className="mt-3">
                        <WeatherMetricGrid
                          precipitation={weather.precipitationMm != null ? `${weather.precipitationMm} mm` : null}
                          humidity={weather.relativeHumidityPercent != null ? `${weather.relativeHumidityPercent}%` : null}
                          windSpeedKmh={weather.windSpeedKmh}
                          windDirectionCompass={weather.windDirectionCompass}
                          pressureHpa={weather.surfacePressureHpa}
                          observedLabel={formatIstTime(weather.observationTime)}
                        />
                      </div>
                    </>
                  )}
                </div>
                <WeatherSourceLabel source={weather.source} className="mt-3" />
              </>
            ) : (
              <WeatherUnavailableNote>
                {summary.weather.message ?? "Live weather is temporarily unavailable."}
              </WeatherUnavailableNote>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
