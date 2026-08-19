"use client";

import { useEffect, useState } from "react";
import {
  AirQualityBadge,
  AqiSourceTabs,
  PollutantMetric,
  WeatherConditionIcon,
  WeatherCurrentHero,
  WeatherMetricGrid,
  WeatherSkeleton,
  WeatherSourceLabel,
  WeatherUnavailableNote,
  useAqiSourceTab,
} from "@/components/weather/WeatherUI";
import {
  ApiUnavailableError,
  fetchDailyForecast,
  fetchLocationSummary,
} from "@/lib/api-client";
import { formatIstTime } from "@/lib/environmentFormat";
import { cn } from "@/lib/cn";
import type {
  DailyForecastDay,
  DailyForecastResponse,
  LocationSummaryResponse,
} from "@/types/environment";

type LoadState = "loading" | "loaded" | "unavailable";
type TabKey = "overview" | "week" | "aqi";

export interface LocationEnvironmentPanelProps {
  latitude: number;
  longitude: number;
  locationLabel?: string;
  locationMeta?: {
    accuracyMeters?: number | null;
    capturedAt?: string | null;
    sourceLabel?: string;
  };
  onClose?: () => void;
}

function dayLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatValue(value: number | null | undefined, suffix = "", fallback = "--"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `${Math.round(value)}${suffix}`;
}

function ambienceClass(code: number | null, isDay: boolean | null): string {
  if (code == null) return "from-slate-50 to-white";
  if (code === 0) return isDay ? "from-amber-50 to-white" : "from-indigo-50 to-white";
  if (code <= 3) return "from-slate-100 to-white";
  if (code <= 48) return "from-slate-200/70 to-white";
  if (code <= 67) return "from-sky-100/70 to-white";
  if (code <= 86) return "from-sky-100 to-white";
  if (code >= 95) return "from-indigo-100/60 to-white";
  return "from-slate-100 to-white";
}

function LocationChip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "sky";
  children: React.ReactNode;
}) {
  const classes =
    tone === "sky"
      ? "bg-sky-50 text-sky-700"
      : "bg-slate-100 text-slate-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${classes}`}>{children}</span>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DailyRow({ day, highlight }: { day: DailyForecastDay; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-slate-100 py-2 last:border-0",
        highlight && "rounded-xl bg-blue-50/60 px-2",
      )}
    >
      <span className="w-9 text-sm font-semibold text-slate-600">{dayLabel(day.date)}</span>
      <WeatherConditionIcon code={day.weatherCode} isDay size={20} />
      <span className="w-12 text-xs font-medium text-blue-500">
        {formatValue(day.precipitationProbabilityMax, "%", "—")}
      </span>
      <span className="ml-auto text-sm text-slate-400">{formatValue(day.temperatureMinC, " deg", "--")}</span>
      <span className="w-12 text-right text-sm font-semibold text-slate-900">
        {formatValue(day.temperatureMaxC, " deg", "--")}
      </span>
    </div>
  );
}

function DailyList({ days }: { days: DailyForecastDay[] }) {
  if (days.length === 0) {
    return <p className="text-xs text-slate-400">7-day forecast unavailable.</p>;
  }
  return (
    <div role="list" aria-label="7-day forecast">
      {days.map((day, i) => (
        <div role="listitem" key={day.date}>
          <DailyRow day={day} highlight={i === 0} />
        </div>
      ))}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-2 py-1.5 text-xs font-medium transition",
        active ? "bg-white text-atlas-cobalt shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

export function LocationEnvironmentPanel({
  latitude,
  longitude,
  locationLabel,
  locationMeta,
  onClose,
}: LocationEnvironmentPanelProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<LocationSummaryResponse | null>(null);
  const [daily, setDaily] = useState<DailyForecastResponse | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [aqiTab, setAqiTab] = useAqiSourceTab("official");

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
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

    fetchDailyForecast(latitude, longitude, controller.signal).then(setDaily).catch(() => {});

    return () => controller.abort();
  }, [latitude, longitude]);

  const weather = summary?.weather.status === "AVAILABLE" ? summary.weather.data : null;
  const nearestStation =
    summary?.officialAirQuality.status === "AVAILABLE" ? summary.officialAirQuality.data : null;
  const today = daily?.days[0] ?? null;

  const displayTitle =
    nearestStation?.city?.trim() || locationLabel || "My Environment";
  const displaySubline =
    nearestStation?.station && nearestStation.station !== nearestStation.city
      ? `Near ${nearestStation.station}`
      : nearestStation?.city
        ? "Nearest known locality"
        : "Saved browser location";

  const accuracyLabel =
    locationMeta?.accuracyMeters != null
      ? `${Math.round(locationMeta.accuracyMeters)} m accuracy`
      : null;

  const overviewCards = !weather || !today
    ? []
    : [
        {
          label: "Now",
          value: formatValue(weather.temperatureC, " deg"),
          hint: weather.feelsLikeC != null ? `Feels ${Math.round(weather.feelsLikeC)} deg` : null,
        },
        {
          label: "Today",
          value: `${formatValue(today.temperatureMaxC, " deg")} / ${formatValue(today.temperatureMinC, " deg")}`,
          hint: "High / low",
        },
        {
          label: "Humidity",
          value: formatValue(weather.relativeHumidityPercent, "%"),
          hint: weather.surfacePressureHpa != null ? `${Math.round(weather.surfacePressureHpa)} hPa` : null,
        },
        {
          label: "Wind",
          value: formatValue(weather.windSpeedKmh, " km/h"),
          hint: weather.windDirectionCompass ?? null,
        },
        {
          label: "Rain",
          value: formatValue(weather.rainMm, " mm"),
          hint: today.precipitationProbabilityMax != null ? `${Math.round(today.precipitationProbabilityMax)}% chance` : null,
        },
        {
          label: "Pressure",
          value: formatValue(weather.surfacePressureHpa, " hPa"),
          hint: weather.relativeHumidityPercent != null ? `${Math.round(weather.relativeHumidityPercent)}% humidity` : null,
        },
      ];

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white shadow-card">
      {loadState === "loading" ? (
        <div className="p-5">
          <WeatherSkeleton lines={4} />
        </div>
      ) : loadState === "unavailable" ? (
        <div className="p-5">
          <WeatherUnavailableNote>
            Environmental information is temporarily unavailable for this location.
          </WeatherUnavailableNote>
        </div>
      ) : (
        summary && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-obsidian-graphite">My Environment</h2>
                <p className="text-sm font-medium text-slate-900">{displayTitle}</p>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{displaySubline}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {accuracyLabel ? <LocationChip tone="sky">{accuracyLabel}</LocationChip> : null}
                  {locationMeta?.capturedAt ? (
                    <LocationChip>Captured {formatIstTime(locationMeta.capturedAt)}</LocationChip>
                  ) : null}
                  {locationMeta?.sourceLabel ? <LocationChip>{locationMeta.sourceLabel}</LocationChip> : null}
                </div>
              </div>
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close environment panel"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition hover:bg-slate-100 hover:text-atlas-cobalt"
                >
                  x
                </button>
              ) : null}
            </div>

            {/* Hero */}
            <div className="px-5 pt-4">
              {weather ? (
                <section
                  className={cn(
                    "overflow-hidden rounded-2xl bg-gradient-to-b px-5 py-5",
                    ambienceClass(weather.weatherCode, weather.isDay),
                  )}
                >
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
                  {summary.weather.dataStatus === "STALE" ? (
                    <span className="mt-3 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Showing last known reading
                    </span>
                  ) : null}
                </section>
              ) : (
                <WeatherUnavailableNote>
                  {summary.weather.message ?? "Live weather is temporarily unavailable."}
                </WeatherUnavailableNote>
              )}
            </div>

            {/* Tabs */}
            <div className="px-5 pt-3">
              <div
                className="flex gap-1 rounded-full bg-slate-100 p-1"
                role="tablist"
                aria-label="Environment views"
              >
                <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
                  Overview
                </TabButton>
                <TabButton active={tab === "week"} onClick={() => setTab("week")}>
                  7-Day
                </TabButton>
                <TabButton active={tab === "aqi"} onClick={() => setTab("aqi")}>
                  Air Quality
                </TabButton>
              </div>
            </div>

            {/* Active card (single scroll region) */}
            <div key={tab} className="weather-fade scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === "overview" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {overviewCards.map((card) => (
                      <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
                    ))}
                  </div>
                  {weather && (
                    <WeatherMetricGrid
                      precipitation={
                        weather.precipitationMm != null ? `${weather.precipitationMm} mm` : null
                      }
                      humidity={
                        weather.relativeHumidityPercent != null
                          ? `${weather.relativeHumidityPercent}%`
                          : null
                      }
                      windSpeedKmh={weather.windSpeedKmh}
                      windDirectionCompass={weather.windDirectionCompass}
                      pressureHpa={weather.surfacePressureHpa}
                      observedLabel={formatIstTime(weather.observationTime)}
                    />
                  )}
                </div>
              )}

              {tab === "week" && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                    7-Day Outlook
                  </h3>
                  <DailyList days={daily?.days ?? []} />
                </div>
              )}

              {tab === "aqi" && (
                <div className="space-y-3">
                  <AqiSourceTabs active={aqiTab} onChange={setAqiTab} />

                  {aqiTab === "official" ? (
                    summary.officialAirQuality.status === "AVAILABLE" &&
                    summary.officialAirQuality.data ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <AirQualityBadge
                            category={summary.officialAirQuality.data.aqiCategory}
                            value={summary.officialAirQuality.data.aqiValue}
                          />
                          {summary.officialAirQuality.distanceKm != null ? (
                            <LocationChip>
                              {summary.officialAirQuality.distanceKm} km from station
                            </LocationChip>
                          ) : null}
                        </div>
                        <p className="mb-3 text-xs text-slate-600">
                          {summary.officialAirQuality.data.city} - {summary.officialAirQuality.data.station}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"].map((key) => {
                            const reading = summary.officialAirQuality.data!.pollutants[key];
                            return (
                              <PollutantMetric
                                key={key}
                                label={key}
                                value={reading?.avg != null ? `${reading.avg} ug/m3` : "--"}
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
                        {summary.officialAirQuality.message ?? "AQI not available."}
                      </WeatherUnavailableNote>
                    )
                  ) : summary.modeledAirQuality.status === "AVAILABLE" &&
                    summary.modeledAirQuality.data ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <StatCard label="US AQI" value={formatValue(summary.modeledAirQuality.data.usAqi)} />
                        <StatCard
                          label="EU AQI"
                          value={formatValue(summary.modeledAirQuality.data.europeanAqi)}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <PollutantMetric
                          label="PM2.5"
                          value={
                            summary.modeledAirQuality.data.pm2_5 != null
                              ? `${summary.modeledAirQuality.data.pm2_5} ug/m3`
                              : "--"
                          }
                        />
                        <PollutantMetric
                          label="PM10"
                          value={
                            summary.modeledAirQuality.data.pm10 != null
                              ? `${summary.modeledAirQuality.data.pm10} ug/m3`
                              : "--"
                          }
                        />
                        <PollutantMetric
                          label="CO"
                          value={
                            summary.modeledAirQuality.data.co != null
                              ? `${summary.modeledAirQuality.data.co} ug/m3`
                              : "--"
                          }
                        />
                        <PollutantMetric
                          label="NO2"
                          value={
                            summary.modeledAirQuality.data.no2 != null
                              ? `${summary.modeledAirQuality.data.no2} ug/m3`
                              : "--"
                          }
                        />
                        <PollutantMetric
                          label="SO2"
                          value={
                            summary.modeledAirQuality.data.so2 != null
                              ? `${summary.modeledAirQuality.data.so2} ug/m3`
                              : "--"
                          }
                        />
                        <PollutantMetric
                          label="O3"
                          value={
                            summary.modeledAirQuality.data.o3 != null
                              ? `${summary.modeledAirQuality.data.o3} ug/m3`
                              : "--"
                          }
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--color-text-secondary)]">
                        Observed: {formatIstTime(summary.modeledAirQuality.data.observationTime)}. Modeled, not an official CPCB station reading.
                      </p>
                    </div>
                  ) : (
                    <WeatherUnavailableNote>
                      {summary.modeledAirQuality.message ??
                        "Modeled air-quality information is temporarily unavailable."}
                    </WeatherUnavailableNote>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {weather && (
              <div className="border-t border-[var(--color-border-subtle)] px-5 py-3">
                <WeatherSourceLabel source={weather.source} />
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
