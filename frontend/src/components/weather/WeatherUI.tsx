"use client";

import { useMemo, useState } from "react";
import {
  Droplets,
  Gauge,
  Wind as WindIcon,
  CloudRain,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  isWindyConditionOverride,
  toneClassName,
  weatherConditionFromCode,
  WINDY_CONDITION,
} from "@/lib/weather/weatherCondition";
import type { AqiCategory } from "@/types/environment";

/* ------------------------------------------------------------------------ */
/* Condition icon                                                           */
/* ------------------------------------------------------------------------ */

export function WeatherConditionIcon({
  code,
  isDay = true,
  windSpeedKmh,
  size = 24,
  className = "",
}: {
  code: number | null | undefined;
  isDay?: boolean | null;
  /** When provided and high enough, shows the Windy icon instead of the code's icon. */
  windSpeedKmh?: number | null;
  size?: number;
  className?: string;
}) {
  const condition = isWindyConditionOverride(windSpeedKmh)
    ? WINDY_CONDITION
    : weatherConditionFromCode(code, isDay);
  const Icon = condition.Icon;
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      className={cn(toneClassName(condition.tone), className)}
      aria-label={condition.label}
    />
  );
}

export function weatherConditionLabel(
  code: number | null | undefined,
  isDay?: boolean | null,
  windSpeedKmh?: number | null
): string {
  if (isWindyConditionOverride(windSpeedKmh)) return WINDY_CONDITION.label;
  return weatherConditionFromCode(code, isDay).label;
}

/* ------------------------------------------------------------------------ */
/* Current-conditions hero                                                  */
/* ------------------------------------------------------------------------ */

export function WeatherCurrentHero({
  temperatureC,
  feelsLikeC,
  code,
  isDay,
  windSpeedKmh,
  highC,
  lowC,
  updatedLabel,
  size = "lg",
}: {
  temperatureC: number | null;
  feelsLikeC?: number | null;
  code: number | null | undefined;
  isDay?: boolean | null;
  windSpeedKmh?: number | null;
  highC?: number | null;
  lowC?: number | null;
  updatedLabel?: string | null;
  size?: "lg" | "md";
}) {
  const label = weatherConditionLabel(code, isDay, windSpeedKmh);
  const tempText = temperatureC == null ? "—" : `${Math.round(temperatureC)}°`;

  return (
    <div className="flex items-start gap-4">
      <WeatherConditionIcon
        code={code}
        isDay={isDay}
        windSpeedKmh={windSpeedKmh}
        size={size === "lg" ? 64 : 48}
        className="mt-1 flex-shrink-0"
      />
      <div className="min-w-0">
        <div className={cn("font-semibold leading-none text-obsidian-graphite", size === "lg" ? "text-5xl" : "text-4xl")}>
          {tempText}
        </div>
        <div className="mt-1.5 text-base font-medium text-obsidian-graphite">{label}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
          {feelsLikeC != null && <span>Feels like {Math.round(feelsLikeC)}°</span>}
          {(highC != null || lowC != null) && (
            <span>
              {highC != null ? `${Math.round(highC)}°` : "—"} / {lowC != null ? `${Math.round(lowC)}°` : "—"}
            </span>
          )}
          {updatedLabel && <span>Updated {updatedLabel}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Metric grid (icon + muted label + value)                                 */
/* ------------------------------------------------------------------------ */

export function WeatherMetric({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2">
      <Icon size={14} className="flex-shrink-0 text-[var(--color-text-secondary)]" />
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
          {label}
        </p>
        <p className="truncate text-xs font-semibold text-obsidian-graphite">{value}</p>
      </div>
    </div>
  );
}

export function WeatherMetricGrid({
  precipitation,
  humidity,
  windSpeedKmh,
  windDirectionCompass,
  pressureHpa,
  observedLabel,
  className,
}: {
  precipitation?: string | null;
  humidity?: string | null;
  windSpeedKmh?: number | null;
  windDirectionCompass?: string | null;
  pressureHpa?: number | null;
  observedLabel?: string | null;
  className?: string;
}) {
  // Wind direction is folded into the Wind tile's value (e.g. "16 km/h W")
  // instead of its own tile, to keep this grid compact in a narrow panel.
  const wind =
    windSpeedKmh != null
      ? `${Math.round(windSpeedKmh)} km/h${windDirectionCompass ? ` ${windDirectionCompass}` : ""}`
      : "—";
  return (
    <div className={cn("grid grid-cols-3 gap-1.5", className)}>
      {precipitation != null && <WeatherMetric Icon={CloudRain} label="Precip" value={precipitation} />}
      {humidity != null && <WeatherMetric Icon={Droplets} label="Humidity" value={humidity} />}
      <WeatherMetric Icon={WindIcon} label="Wind" value={wind} />
      {pressureHpa != null && (
        <WeatherMetric Icon={Gauge} label="Pressure" value={`${Math.round(pressureHpa)} hPa`} />
      )}
      {observedLabel && <WeatherMetric Icon={Clock} label="Observed" value={observedLabel} />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Tabs (Temperature / Precipitation / Wind)                                */
/* ------------------------------------------------------------------------ */

export type WeatherTabKey = "temperature" | "precipitation" | "wind" | "aqi";

const TAB_LABELS: Record<WeatherTabKey, string> = {
  temperature: "Temperature",
  precipitation: "Precipitation",
  wind: "Wind",
  aqi: "AQI",
};

export function WeatherTabs({
  active,
  onChange,
  tabs = ["temperature", "precipitation", "wind", "aqi"],
  className,
}: {
  active: WeatherTabKey;
  onChange: (tab: WeatherTabKey) => void;
  tabs?: WeatherTabKey[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 rounded-xl bg-gray-100 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onChange(tab)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab
              ? "bg-white text-obsidian-graphite shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-obsidian-graphite"
          )}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* AQI source tabs (Official CPCB / Modeled) - keeps both sections          */
/* clearly labeled but avoids stacking them and doubling panel height.      */
/* ------------------------------------------------------------------------ */

export type AqiSourceTabKey = "official" | "modeled";

export function AqiSourceTabs({
  active,
  onChange,
  className,
}: {
  active: AqiSourceTabKey;
  onChange: (tab: AqiSourceTabKey) => void;
  className?: string;
}) {
  const tabs: { key: AqiSourceTabKey; label: string }[] = [
    { key: "official", label: "Official (CPCB)" },
    { key: "modeled", label: "Modeled" },
  ];
  return (
    <div role="tablist" className={cn("flex gap-1 rounded-xl bg-gray-100 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab.key
              ? "bg-white text-obsidian-graphite shadow-sm"
              : "text-[var(--color-text-secondary)] hover:text-obsidian-graphite"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function useAqiSourceTab(initial: AqiSourceTabKey = "official") {
  return useState<AqiSourceTabKey>(initial);
}

/* ------------------------------------------------------------------------ */
/* Hourly chart (smooth SVG line/area - no external chart library)          */
/* ------------------------------------------------------------------------ */

export interface HourlyPoint {
  label: string;
  value: number | null;
}

export function WeatherHourlyChart({
  points,
  unit,
  variant = "line",
  className,
}: {
  points: HourlyPoint[];
  unit: string;
  /** "line" for temperature/wind, "bars" for precipitation probability. */
  variant?: "line" | "bars";
  className?: string;
}) {
  const width = 560;
  const height = 104;
  const padX = 8;
  const padTop = 14;
  const padBottom = 20;

  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;

  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const step = points.length > 1 ? plotW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const y = p.value == null ? null : padTop + plotH - ((p.value - min) / span) * plotH;
    return { x, y, value: p.value };
  });

  const linePath = useMemo(() => {
    let d = "";
    let started = false;
    for (const c of coords) {
      if (c.y == null) {
        started = false;
        continue;
      }
      d += `${started ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)} `;
      started = true;
    }
    return d.trim();
  }, [coords]);

  const areaPath = useMemo(() => {
    if (!linePath) return "";
    const last = coords[coords.length - 1];
    const first = coords[0];
    if (!first || !last) return "";
    return `${linePath} L${last.x.toFixed(1)},${(padTop + plotH).toFixed(1)} L${first.x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;
  }, [linePath, coords, plotH]);

  // Show ~6 evenly spaced axis labels so the chart doesn't get noisy.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      role="img"
      aria-label={`Hourly ${unit} chart`}
    >
      {variant === "bars" ? (
        coords.map((c, i) =>
          c.y == null ? null : (
            <rect
              key={i}
              x={c.x - Math.max(2, step * 0.28)}
              y={c.y}
              width={Math.max(4, step * 0.56)}
              height={padTop + plotH - c.y}
              rx={2}
              fill="var(--color-atlas-cobalt, #2563eb)"
              fillOpacity={0.75}
            />
          )
        )
      ) : (
        <>
          {areaPath && <path d={areaPath} fill="var(--color-atlas-cobalt, #2563eb)" fillOpacity={0.12} />}
          {linePath && (
            <path d={linePath} fill="none" stroke="var(--color-atlas-cobalt, #2563eb)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {coords.map((c, i) =>
            c.y == null ? null : <circle key={i} cx={c.x} cy={c.y} r={2.25} fill="var(--color-atlas-cobalt, #2563eb)" />
          )}
        </>
      )}

      {points.map((p, i) =>
        i % labelEvery !== 0 ? null : (
          <text
            key={i}
            x={padX + i * step}
            y={height - 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-text-secondary, #64748b)"
          >
            {p.label}
          </text>
        )
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Daily forecast row (compact, not giant cards)                            */
/* ------------------------------------------------------------------------ */

export interface DailyForecastItem {
  dayLabel: string;
  code: number | null;
  highC: number | null;
  lowC: number | null;
  precipitationProbability?: number | null;
}

export function DailyForecastRow({
  days,
  className,
}: {
  days: DailyForecastItem[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col divide-y divide-[var(--color-border-subtle)]", className)}>
      {days.map((day, i) => (
        <div key={i} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-9 flex-shrink-0 font-medium text-obsidian-graphite">{day.dayLabel}</span>
          <WeatherConditionIcon code={day.code} isDay size={20} className="flex-shrink-0" />
          {day.precipitationProbability != null && (
            <span className="w-10 flex-shrink-0 text-xs text-blue-500">
              {day.precipitationProbability > 0 ? `${Math.round(day.precipitationProbability)}%` : ""}
            </span>
          )}
          <span className="ml-auto flex-shrink-0 text-xs text-[var(--color-text-secondary)]">
            {day.lowC != null ? `${Math.round(day.lowC)}°` : "—"}
          </span>
          <span className="w-9 flex-shrink-0 text-right font-medium text-obsidian-graphite">
            {day.highC != null ? `${Math.round(day.highC)}°` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Air quality badge + pollutant grid                                       */
/* ------------------------------------------------------------------------ */

// Matches OfficialAqiDetails.tsx's CATEGORY_COLOR - one shared AQI colour
// scale across the app (CPCB's 6-category system).
const AQI_CATEGORY_STYLE: Record<AqiCategory, { bg: string; text: string }> = {
  Good: { bg: "bg-emerald-50", text: "text-emerald-700" },
  Satisfactory: { bg: "bg-lime-50", text: "text-lime-700" },
  Moderate: { bg: "bg-amber-50", text: "text-amber-700" },
  Poor: { bg: "bg-orange-50", text: "text-orange-700" },
  "Very Poor": { bg: "bg-red-50", text: "text-red-700" },
  Severe: { bg: "bg-red-100", text: "text-red-900" },
};

export function AirQualityBadge({
  category,
  value,
  className,
}: {
  category: AqiCategory | null | undefined;
  value?: number | null;
  className?: string;
}) {
  const style = category ? AQI_CATEGORY_STYLE[category] : { bg: "bg-gray-100", text: "text-gray-500" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        style.bg,
        style.text,
        className
      )}
    >
      {value != null && <span>{Math.round(value)}</span>}
      {category ?? "Not Available"}
    </span>
  );
}

export function PollutantMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2.5 py-2">
      <p className="text-[10px] font-medium text-[var(--color-text-secondary)]">{label}</p>
      <p className="text-sm font-semibold text-obsidian-graphite">{value}</p>
    </div>
  );
}

export function WeatherSourceLabel({ source, className }: { source: string; className?: string }) {
  return <p className={cn("text-[11px] text-[var(--color-text-secondary)]", className)}>Source: {source}</p>;
}

/* ------------------------------------------------------------------------ */
/* Loading / unavailable states                                             */
/* ------------------------------------------------------------------------ */

export function WeatherSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2" role="status" aria-label="Loading weather">
      <div className="h-10 w-24 rounded bg-gray-200" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-3 w-full rounded bg-gray-100" />
      ))}
    </div>
  );
}

export function WeatherUnavailableNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-[var(--color-text-secondary)]">{children}</p>
  );
}

/** Hook that tracks the active hourly tab, kept here so panels don't duplicate the same useState. */
export function useWeatherTab(initial: WeatherTabKey = "temperature") {
  return useState<WeatherTabKey>(initial);
}
