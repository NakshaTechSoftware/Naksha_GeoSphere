"use client";

import { useEffect, useRef, useState } from "react";
import {
  Droplets,
  Gauge,
  Wind as WindIcon,
  CloudRain,
  X,
  ChevronRight,
  Clock,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  WeatherConditionIcon,
  WeatherCurrentHero,
  weatherConditionLabel,
} from "@/components/weather/WeatherUI";
import { formatMetric, formatIstTime } from "@/lib/environmentFormat";
import type {
  AqiCategory,
  CpcbStation,
  DailyForecastNormalized,
  HourlyForecastNormalized,
  ImdWarningProperties,
  ModeledAirQuality,
  WeatherPanelState,
} from "@/types/environment";

interface WeatherDetailsPanelProps {
  weatherPanel: WeatherPanelState;
  /** An active IMD district warning at the currently selected location, if
   *  any - a fully independent fourth domain (see WeatherPanelState docs).
   *  Never derived from / never overwrites current, forecast, or AQI. */
  imdWarning: ImdWarningProperties | null;
  onClose: () => void;
  onRetry: () => void;
}

type TabKey = "overview" | "hourly" | "week" | "aqi";

/* ------------------------------------------------------------------ */
/* Small formatting helpers                                           */
/* ------------------------------------------------------------------ */

function hourLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
      .format(new Date(iso))
      .replace(":00", "");
  } catch {
    return "";
  }
}

function dayLabel(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(`${dateStr}T00:00:00+05:30`));
  } catch {
    return dateStr.slice(5);
  }
}

const AQI_COLOR: Record<AqiCategory, string> = {
  Good: "text-emerald-600",
  Satisfactory: "text-lime-600",
  Moderate: "text-yellow-600",
  Poor: "text-orange-600",
  "Very Poor": "text-red-600",
  Severe: "text-purple-700",
};

function aqiCategoryFromUsAqi(n: number): AqiCategory {
  if (n <= 50) return "Good";
  if (n <= 100) return "Satisfactory";
  if (n <= 200) return "Moderate";
  if (n <= 300) return "Poor";
  if (n <= 400) return "Very Poor";
  return "Severe";
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

function nextHourPoint(points: HourlyForecastNormalized[]) {
  if (points.length === 0) return null;
  const now = Date.now();
  const upcoming = points.find((p) => {
    const t = new Date(p.time).getTime();
    return !Number.isNaN(t) && t >= now - 20 * 60 * 1000;
  });
  return upcoming ?? points[0]!;
}

/* ------------------------------------------------------------------ */
/* Reusable atoms                                                     */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
      {children}
    </h3>
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function SourcePill({
  text,
  variant = "modeled",
}: {
  text: string;
  variant?: "modeled" | "official" | "observed";
}) {
  const styles: Record<string, string> = {
    modeled: "bg-slate-100 text-slate-500",
    official: "bg-emerald-50 text-emerald-700",
    observed: "bg-blue-50 text-blue-600",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        styles[variant],
      )}
    >
      {text}
    </span>
  );
}

/* Compact quick-condition tile: icon + label on top, value below. */
function QuickMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <Icon size={13} className="text-slate-400" aria-hidden />
        {label}
      </div>
      <p className="mt-0.5 text-base font-semibold text-slate-800">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Carousels                                                          */
/* ------------------------------------------------------------------ */

function HourlyStrip({
  hourly,
  scrollRef,
}: {
  hourly: HourlyForecastNormalized[];
  scrollRef?: React.MutableRefObject<number>;
}) {
  const points = hourly.slice(0, 48);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; left: number; active: boolean; moved: boolean } | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateEdges = () => {
    const el = scrollElRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft < max - 1);
  };

  // Restore/persist scroll position (reset to "Now" on location change is
  // handled by the parent resetting scrollRef before this effect runs).
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    el.scrollLeft = scrollRef?.current ?? 0;
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourly]);

  // Horizontal wheel / trackpad support (non-passive so we can preventDefault).
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const target = el.scrollLeft + delta;
      const clamped = Math.max(0, Math.min(max, target));
      if (clamped === el.scrollLeft) return; // at limit -> allow vertical scroll
      e.preventDefault();
      el.scrollLeft = clamped;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep edges + persisted position fresh on resize.
  useEffect(() => {
    const onResize = () => updateEdges();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onScroll = () => {
    const el = scrollElRef.current;
    if (el && scrollRef) scrollRef.current = el.scrollLeft;
    updateEdges();
  };

  // Mouse click-and-drag (touch uses native pan-x scrolling).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollElRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, left: el.scrollLeft, active: true, moved: false };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved && scrollElRef.current) {
      scrollElRef.current.scrollLeft = d.left - dx;
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    try {
      scrollElRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollElRef.current;
    if (!el) return;
    const step = 180;
    if (e.key === "ArrowRight") {
      el.scrollBy({ left: step, behavior: "smooth" });
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      el.scrollBy({ left: -step, behavior: "smooth" });
      e.preventDefault();
    }
  };

  if (points.length === 0) {
    return <p className="text-xs text-slate-400">Hourly forecast unavailable.</p>;
  }

  return (
    <div className="relative">
      <div
        ref={scrollElRef}
        role="list"
        aria-label="Hourly forecast"
        tabIndex={0}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "scrollbar-hide flex snap-x snap-proximity gap-1 overflow-x-auto overflow-y-hidden pb-1 pr-4",
          "scroll-smooth touch-pan-x outline-none",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
      >
        {points.map((p, i) => (
          <div
            key={p.time}
            role="listitem"
            className={cn(
              "flex w-14 shrink-0 snap-start flex-col items-center gap-1 rounded-xl px-1 py-2",
              i === 0 && "bg-blue-50/70",
            )}
          >
            <span className="text-[11px] font-medium text-slate-500">
              {i === 0 ? "Now" : hourLabel(p.time)}
            </span>
            <WeatherConditionIcon code={p.weatherCode} isDay={p.isDay} size={20} />
            <span className="text-sm font-semibold text-slate-900">
              {Math.round(p.temperatureC ?? 0)}°
            </span>
            <span className="text-[10px] text-blue-500">
              {p.rainProbabilityPct ?? 0}%
            </span>
          </div>
        ))}
      </div>

      {/* State-aware edge fades (never block pointer events). */}
      {canLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white/80 to-transparent" />
      )}
      {canRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/80 to-transparent" />
      )}
    </div>
  );
}

function DailyRow({
  day,
  highlight,
}: {
  day: DailyForecastNormalized;
  highlight?: boolean;
}) {
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
        {day.rainProbabilityPct != null
          ? `${Math.round(day.rainProbabilityPct)}%`
          : "—"}
      </span>
      <span className="ml-auto text-sm text-slate-400">{Math.round(day.temperatureMinC ?? 0)}°</span>
      <span className="w-12 text-right text-sm font-semibold text-slate-900">
        {Math.round(day.temperatureMaxC ?? 0)}°
      </span>
    </div>
  );
}

function DailyList({ daily }: { daily: DailyForecastNormalized[] }) {
  const days = daily;
  if (days.length === 0) {
    return <p className="text-xs text-slate-400">7-day forecast unavailable.</p>;
  }
  return (
    <div role="list" aria-label="7-day forecast">
      {days.map((d, i) => (
        <div role="listitem" key={d.date}>
          <DailyRow day={d} highlight={i === 0} />
        </div>
      ))}
    </div>
  );
}

/* Horizontal 7-day strip used directly inside the Overview. */
function DailyStrip({
  daily,
  scrollRef,
}: {
  daily: DailyForecastNormalized[];
  scrollRef?: React.MutableRefObject<number>;
}) {
  const days = daily;
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; left: number; active: boolean; moved: boolean } | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateEdges = () => {
    const el = scrollElRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft < max - 1);
  };

  // Restore/persist scroll position (reset to start on location change is
  // handled by the parent resetting scrollRef before this effect runs).
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    el.scrollLeft = scrollRef?.current ?? 0;
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily]);

  // Horizontal wheel / trackpad support (non-passive so we can preventDefault).
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const target = el.scrollLeft + delta;
      const clamped = Math.max(0, Math.min(max, target));
      if (clamped === el.scrollLeft) return; // at limit -> allow vertical scroll
      e.preventDefault();
      el.scrollLeft = clamped;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep edges fresh on resize.
  useEffect(() => {
    const onResize = () => updateEdges();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onScroll = () => {
    const el = scrollElRef.current;
    if (el && scrollRef) scrollRef.current = el.scrollLeft;
    updateEdges();
  };

  // Mouse click-and-drag (touch uses native pan-x scrolling).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollElRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, left: el.scrollLeft, active: true, moved: false };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved && scrollElRef.current) {
      scrollElRef.current.scrollLeft = d.left - dx;
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    try {
      scrollElRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollElRef.current;
    if (!el) return;
    const step = 140;
    if (e.key === "ArrowRight") {
      el.scrollBy({ left: step, behavior: "smooth" });
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      el.scrollBy({ left: -step, behavior: "smooth" });
      e.preventDefault();
    }
  };

  if (days.length === 0) {
    return <p className="text-xs text-slate-400">7-day forecast unavailable.</p>;
  }

  return (
    <div className="relative">
      <div
        ref={scrollElRef}
        role="list"
        aria-label="7-day forecast"
        tabIndex={0}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "scrollbar-hide flex snap-x snap-proximity gap-2 overflow-x-auto overflow-y-hidden pb-1 pr-4",
          "scroll-smooth touch-pan-x outline-none",
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
      >
        {days.map((d, i) => (
          <div
            key={d.date}
            role="listitem"
            className="flex w-16 shrink-0 snap-start flex-col items-center gap-1 rounded-xl bg-slate-50 px-1 py-2"
          >
            <span className="text-[11px] font-semibold text-slate-500">
              {i === 0 ? "Now" : dayLabel(d.date)}
            </span>
            <WeatherConditionIcon code={d.weatherCode} isDay size={20} />
            <span className="text-[10px] text-blue-500">
              {d.rainProbabilityPct != null
                ? `${Math.round(d.rainProbabilityPct)}%`
                : ""}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-400">{Math.round(d.temperatureMinC ?? 0)}°</span>
              <span className="font-semibold text-slate-900">{Math.round(d.temperatureMaxC ?? 0)}°</span>
            </div>
          </div>
        ))}
      </div>

      {/* State-aware edge fades (never block pointer events). */}
      {canLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white/80 to-transparent" />
      )}
      {canRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white/80 to-transparent" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts (derived from the one fetched response)                      */
/* ------------------------------------------------------------------ */

function WeatherGraph({ hourly }: { hourly: HourlyForecastNormalized[] }) {
  const points = hourly.slice(0, 24);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="text-xs text-slate-400">Chart unavailable.</p>;

  const W = 340;
  const H = 140;
  const padX = 12;
  const padTop = 16;
  const padBottom = 22;
  const n = points.length;
  const temps = points.map((p) => p.temperatureC ?? 0);
  const tmin = Math.min(...temps);
  const tmax = Math.max(...temps);
  const tspan = tmax - tmin || 1;
  const maxRain = Math.max(1, ...points.map((p) => p.rainProbabilityPct ?? 0));

  const xFor = (i: number) => padX + (i * (W - 2 * padX)) / (n - 1);
  const yFor = (t: number) =>
    padTop + (1 - (t - tmin) / tspan) * (H - padTop - padBottom);

  const line = temps
    .map((t, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(t).toFixed(1)}`)
    .join(" ");
  const area =
    `M${xFor(0).toFixed(1)},${yFor(temps[0] ?? tmin).toFixed(1)} ` +
    temps.map((t, i) => `L${xFor(i).toFixed(1)},${yFor(t).toFixed(1)}`).join(" ") +
    ` L${xFor(n - 1).toFixed(1)},${H - padBottom} L${xFor(0).toFixed(1)},${H - padBottom} Z`;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const i = Math.round(fx * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hp = hover != null ? points[hover] : null;
  const hx = hover != null ? xFor(hover) : 0;

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hourly temperature and rain">
        <defs>
          <linearGradient id="tempArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3563e9" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#3563e9" stopOpacity="0" />
          </linearGradient>
        </defs>

        {points.map((p, i) => {
          const h = ((p.rainProbabilityPct ?? 0) / maxRain) * (H - padTop - padBottom);
          return (
            <rect
              key={`rain-${i}`}
              x={xFor(i) - 3}
              y={H - padBottom - h}
              width={6}
              height={h}
              rx={2}
              className="fill-blue-200"
            />
          );
        })}

        <path d={area} fill="url(#tempArea)" />
        <path d={line} fill="none" stroke="#3563e9" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {hover != null && hp && (
          <circle cx={hx} cy={yFor(hp.temperatureC ?? tmin)} r={4} className="fill-[#3563e9] stroke-white" strokeWidth={2} />
        )}

        {points.map((p, i) =>
          i % 4 === 0 ? (
            <text
              key={`x-${i}`}
              x={xFor(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-slate-400"
              fontSize={9}
            >
              {i === 0 ? "Now" : hourLabel(p.time)}
            </text>
          ) : null,
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-center shadow-lg"
          style={{ left: `${(hx / W) * 100}%` }}
        >
          <div className="text-[10px] font-semibold uppercase text-slate-400">
            {hourLabel(hp.time)}
          </div>
          <div className="text-sm font-bold text-slate-800">
            {hp.temperatureC != null ? `${Math.round(hp.temperatureC)}°` : "—"}
          </div>
          <div className="text-[10px] text-blue-500">
            {hp.rainProbabilityPct != null
              ? `${Math.round(hp.rainProbabilityPct)}% rain`
              : ""}
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-[#3563e9]" /> Temperature
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded-full bg-blue-200" /> Rain chance
        </span>
      </div>
    </div>
  );
}

function AqiBadge({ value, category }: { value: number; category: AqiCategory }) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn("text-5xl font-semibold leading-none", AQI_COLOR[category])}>{value}</div>
      <div className="mt-1 text-sm text-slate-500">{category}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AQI resolution (official preferred, modeled fallback)                */
/* ------------------------------------------------------------------ */

function resolveAqi(official: CpcbStation | null, modeled: ModeledAirQuality | null) {
  const isOfficial = !!official;
  const value = isOfficial ? official!.aqiValue : modeled?.usAqi ?? null;
  const category = isOfficial
    ? official!.aqiCategory
    : modeled?.usAqi != null
      ? aqiCategoryFromUsAqi(modeled.usAqi)
      : null;
  const station = official?.station ?? null;
  return { isOfficial, value, category, station };
}

/* Compact AQI summary shown inside Overview. */
function AqiSummary({
  official,
  modeled,
}: {
  official: CpcbStation | null;
  modeled: ModeledAirQuality | null;
}) {
  const aqi = resolveAqi(official, modeled);
  if (aqi.value == null) {
    return <p className="text-xs text-slate-400">Air quality unavailable.</p>;
  }
  const color = aqi.category ? AQI_COLOR[aqi.category] : "text-slate-600";
  const source = aqi.isOfficial
    ? `Official · ${aqi.station ?? "CPCB"}`
    : "Modeled · Open-Meteo";
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Air Quality
      </span>
      <div className="mt-1 flex items-end gap-2">
        <span className={cn("text-2xl font-bold leading-none", color)}>{aqi.value}</span>
        {aqi.category && (
          <span className={cn("text-sm font-medium", color)}>· {aqi.category}</span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-slate-400">{source}</p>
    </div>
  );
}

/* Pollutant grid that works for both official (CPCB) and modeled sources. */
function PollutantGrid({ official, modeled }: { official: CpcbStation | null; modeled: ModeledAirQuality | null }) {
  if (official?.pollutants) {
    const keys = ["pm2_5", "pm10", "no2", "so2", "co", "o3"];
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {keys.map((key) => (
          <div key={key} className="rounded-xl bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">{key.toUpperCase()}</p>
            <p className="text-sm font-semibold text-slate-800">
              {official.pollutants[key]?.avg != null ? `${official.pollutants[key].avg}` : "--"}
            </p>
          </div>
        ))}
      </div>
    );
  }
  if (modeled) {
    const rows: [string, number | null][] = [
      ["PM2.5", modeled.pm2_5],
      ["PM10", modeled.pm10],
      ["NO2", modeled.no2],
      ["SO2", modeled.so2],
      ["CO", modeled.co],
      ["O3", modeled.o3],
    ];
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {rows.map(([key, val]) => (
          <div key={key} className="rounded-xl bg-slate-50 px-2.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">{key}</p>
            <p className="text-sm font-semibold text-slate-800">{val != null ? `${val}` : "--"}</p>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-xs text-slate-400">Pollutant breakdown unavailable.</p>;
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function Skeleton() {
  return (
    <div className="space-y-4 p-5">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
      <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main panel                                                         */
/* ------------------------------------------------------------------ */

export function WeatherDetailsPanel({
  weatherPanel,
  imdWarning,
  onClose,
  onRetry,
}: WeatherDetailsPanelProps) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [hourlyView, setHourlyView] = useState<"list" | "graph">("graph");
  const [aqiSource, setAqiSource] = useState<"official" | "modeled">("official");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Persist the Hourly List and 7-Day strip scroll positions so they survive
  // tab toggles. Reset to the start whenever the selected location itself
  // changes (not when a pipeline re-resolves for the same location, e.g. a
  // retry, and not when toggling tabs).
  const hourlyScrollRef = useRef(0);
  const dailyScrollRef = useRef(0);
  const prevLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  // Three independent pipelines - each can be idle/loading/success/error on
  // its own. A slow or failed forecast never blocks current weather (or AQI)
  // from rendering, and vice versa - see loadWeatherAtPoint in
  // IndiaMapViewer.tsx and lib/weather/weatherPipelines.ts.
  const active = weatherPanel.status === "active";
  const location = active ? weatherPanel.location : null;
  const currentPipeline = active ? weatherPanel.current : null;
  const forecastPipeline = active ? weatherPanel.forecast : null;
  const aqiPipeline = active ? weatherPanel.aqi : null;

  const current = currentPipeline?.data ?? null;
  const hourly = forecastPipeline?.data?.hourly ?? [];
  const daily = forecastPipeline?.data?.daily ?? [];
  const officialAqi = aqiPipeline?.official ?? null;
  const modeledAqi = aqiPipeline?.modeled ?? null;

  // Every pipeline still loading (nothing has arrived for this location yet)
  // shows the full skeleton, same as the old single "loading" status did.
  // Every pipeline having failed shows the full retry state. Otherwise -
  // including every in-between combination of loading/success/error across
  // the three - render the panel and let each section show its own
  // loading/unavailable state independently (see section bodies below).
  const allLoading =
    currentPipeline?.status === "loading" &&
    forecastPipeline?.status === "loading" &&
    aqiPipeline?.status === "loading";
  const allFailed =
    currentPipeline?.status === "error" &&
    forecastPipeline?.status === "error" &&
    aqiPipeline?.status === "error";

  if (location && (prevLocationRef.current?.latitude !== location.latitude || prevLocationRef.current?.longitude !== location.longitude)) {
    prevLocationRef.current = location;
    hourlyScrollRef.current = 0;
    dailyScrollRef.current = 0;
  }

  const title = location?.locationLabel ?? "Selected point";
  const station = officialAqi?.station ?? null;
  const subtitle = station ? `Near ${station}` : "Exact clicked point";
  const coords = location ? `${location.latitude.toFixed(3)}°N, ${location.longitude.toFixed(3)}°E` : "";
  const officialDistanceKm = aqiPipeline?.distanceKm ?? null;
  const updatedLabel = current ? formatIstTime(current.observedAt) : null;

  const conditionText = current
    ? weatherConditionLabel(current.weatherCode, current.isDay, current.windSpeedKmh)
    : "Conditions unavailable";

  const windValue = current
    ? `${Math.round(current.windSpeedKmh ?? 0)} km/h${current.windDirectionText ? ` ${current.windDirectionText}` : ""}`
    : "—";

  const aqi = resolveAqi(officialAqi, modeledAqi);
  const bothAqi = !!officialAqi && !!modeledAqi;
  const aqiTabActive = bothAqi
    ? aqiSource === "official"
      ? officialAqi
      : modeledAqi
    : aqi.isOfficial
      ? officialAqi
      : modeledAqi;

  const next = nextHourPoint(hourly);
  const nextTemp = next ? Math.round(next.temperatureC ?? 0) : null;
  const nextRain = next?.rainProbabilityPct ?? null;
  const nextWind = next?.windSpeedKmh ?? null;
  const nextWindDir = next?.windDirectionText ?? "";

  return (
    <aside
      className="weather-panel-in pointer-events-auto absolute right-4 top-20 z-20 flex w-[min(420px,calc(100%-2rem))] flex-col max-md:inset-x-0 max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:top-auto max-md:w-full max-md:rounded-b-none"
      aria-label="Weather details"
    >
      <div className="flex h-full max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_12px_36px_rgba(15,23,42,0.14)] backdrop-blur-[16px] max-md:max-h-[80vh]">
        {weatherPanel.status === "idle" && (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
            Click anywhere on the map to load a compact weather summary for that point.
          </div>
        )}

        {active && allLoading && <Skeleton />}

        {active && allFailed && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-slate-600">Weather information temporarily unavailable</p>
            <button
              onClick={onRetry}
              className="rounded-full bg-atlas-cobalt px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {active && !allLoading && !allFailed && (
          <>
            {/* Header */}
            <header className="flex items-start justify-between gap-3 border-b border-white/60 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
                <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <SourcePill text="Modeled · Open-Meteo" variant="modeled" />
                  {aqi.isOfficial ? (
                    <SourcePill
                      text={`Official · ${aqi.station ?? "Govt"}`}
                      variant="official"
                    />
                  ) : (
                    <SourcePill text="AQI Modeled" variant="modeled" />
                  )}
                  {updatedLabel && <SourcePill text={`Updated ${updatedLabel}`} variant="observed" />}
                  {officialDistanceKm != null && (
                    <SourcePill
                      text={`Station ${Math.round(officialDistanceKm)} km`}
                      variant="observed"
                    />
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close weather panel"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </header>

            {/* IMD warning summary - independent of current/forecast/AQI below;
                only shown for an actual active alert (Yellow/Orange/Red), not
                for a routine "no warning" (Green) district. */}
            {imdWarning && imdWarning.severity && imdWarning.severity !== "GREEN" && (
              <div className="mx-5 mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <TriangleAlert size={16} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold text-amber-900">
                    IMD Warning
                    {imdWarning.description ? ` · ${imdWarning.description}` : ""}
                  </p>
                  <p className="mt-0.5 text-amber-700">
                    {imdWarning.severity}
                    {imdWarning.validUntil && ` · Valid until ${formatIstTime(imdWarning.validUntil)}`}
                  </p>
                </div>
              </div>
            )}

            {/* Scroll-free fixed top: hero + next hour */}
            <div className="space-y-3 px-5 pt-4">
              <section
                className={cn(
                  "overflow-hidden rounded-2xl bg-gradient-to-b px-5 py-5",
                  ambienceClass(current?.weatherCode ?? null, current?.isDay ?? null),
                )}
              >
                <WeatherCurrentHero
                  temperatureC={current?.temperatureC ?? null}
                  feelsLikeC={current?.feelsLikeC ?? null}
                  code={current?.weatherCode ?? null}
                  isDay={current?.isDay ?? null}
                  windSpeedKmh={current?.windSpeedKmh ?? null}
                  highC={daily[0]?.temperatureMaxC ?? null}
                  lowC={daily[0]?.temperatureMinC ?? null}
                  updatedLabel={current ? formatIstTime(current.observedAt) : null}
                  size="lg"
                />
              </section>

              {/* Next hour highlight */}
              <section className="flex items-center gap-3 rounded-2xl border border-atlas-cobalt/30 bg-blue-50/60 px-4 py-3">
                <WeatherConditionIcon code={next?.weatherCode ?? null} isDay={next?.isDay ?? null} size={28} />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-atlas-cobalt">
                    Next hour
                  </p>
                  <p className="text-sm text-slate-700">
                    {nextTemp != null ? `${nextTemp}°` : "—"}
                    {nextRain != null && <span className="text-blue-600"> · {nextRain}% rain</span>}
                    {nextWind != null && (
                      <span className="text-slate-500">
                        {" "}
                        · {Math.round(nextWind)} km/h{nextWindDir ? ` ${nextWindDir}` : ""}
                      </span>
                    )}
                  </p>
                </div>
              </section>
            </div>

            {/* Tabs (fixed) */}
            <div className="px-5 pt-3">
              <div
                className="flex gap-1 rounded-full bg-slate-100 p-1"
                role="tablist"
                aria-label="Weather views"
              >
                <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
                  Overview
                </TabButton>
                <TabButton active={tab === "hourly"} onClick={() => setTab("hourly")}>
                  Hourly
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
            <div
              key={tab}
              className="weather-fade scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              {tab === "overview" && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">{conditionText} today.</p>

                  {/* Quick conditions — compact 2-column grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <QuickMetric
                      icon={Droplets}
                      label="Humidity"
                      value={formatMetric(current?.humidityPct ?? null, "%")}
                    />
                    <QuickMetric icon={WindIcon} label="Wind" value={windValue} />
                    <QuickMetric
                      icon={CloudRain}
                      label="Rain"
                      value={formatMetric(current?.rainMm ?? null, "mm")}
                    />
                    <QuickMetric
                      icon={Gauge}
                      label="Surface pressure"
                      value={formatMetric(current?.pressureHpa ?? null, "hPa")}
                    />
                  </div>

                  {/* AQI summary (always visible in Overview) */}
                  <AqiSummary official={officialAqi} modeled={modeledAqi} />

                  {/* 7-day preview */}
                  <div>
                    <SectionTitle>7-Day forecast</SectionTitle>
                    <DailyStrip daily={daily} scrollRef={dailyScrollRef} />
                  </div>

                  {/* Secondary details — no duplication of the hero/quick values */}
                  <button
                    onClick={() => setDetailsOpen((o) => !o)}
                    aria-expanded={detailsOpen}
                    className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <span>More details</span>
                    <ChevronRight
                      size={16}
                      className={cn("transition-transform", detailsOpen && "rotate-90")}
                    />
                  </button>
                  {detailsOpen && current && (
                    <dl className="weather-fade rounded-xl border border-slate-100 px-4 py-1">
                      <DetailRow label="Observed" value={formatIstTime(current.observedAt)} />
                      {aqi.isOfficial && officialAqi?.station && (
                        <DetailRow label="AQI station" value={officialAqi.station} />
                      )}
                      {!aqi.isOfficial && <DetailRow label="AQI" value="Modeled (Open-Meteo)" />}
                    </dl>
                  )}
                </div>
              )}

              {tab === "hourly" && (
                <div className="space-y-3">
                  <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
                    <TabButton active={hourlyView === "list"} onClick={() => setHourlyView("list")}>
                      List
                    </TabButton>
                    <TabButton active={hourlyView === "graph"} onClick={() => setHourlyView("graph")}>
                      Graph
                    </TabButton>
                  </div>
                  {hourlyView === "list" && <HourlyStrip hourly={hourly} scrollRef={hourlyScrollRef} />}
                  {hourlyView === "graph" && <WeatherGraph hourly={hourly} />}
                </div>
              )}

              {tab === "week" && (
                <div className="space-y-3">
                  <SectionTitle>Next 7 days</SectionTitle>
                  <DailyList daily={daily} />
                </div>
              )}

              {tab === "aqi" && (
                <div className="space-y-3">
                  {!aqiTabActive && <p className="text-xs text-slate-400">Air quality unavailable.</p>}
                  {bothAqi && (
                    <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
                      <TabButton
                        active={aqiSource === "official"}
                        onClick={() => setAqiSource("official")}
                      >
                        Official{officialAqi?.station ? ` · ${officialAqi.station}` : ""}
                      </TabButton>
                      <TabButton
                        active={aqiSource === "modeled"}
                        onClick={() => setAqiSource("modeled")}
                      >
                        Modeled
                      </TabButton>
                    </div>
                  )}
                  {aqiTabActive &&
                    (() => {
                      const isOff = !!officialAqi && aqiTabActive === officialAqi;
                      const modeledForTab =
                        isOff || !aqiTabActive ? null : (aqiTabActive as ModeledAirQuality);
                      const val = isOff ? officialAqi!.aqiValue : modeledForTab?.usAqi ?? null;
                      const cat = isOff
                        ? officialAqi!.aqiCategory
                        : modeledForTab
                          ? aqiCategoryFromUsAqi(modeledForTab.usAqi ?? 0)
                          : null;
                      if (val == null || !cat) {
                        return <p className="text-sm text-slate-500">AQI value unavailable.</p>;
                      }
                      return (
                        <>
                          <AqiBadge value={val} category={cat} />
                          <p className="text-center text-[11px] text-slate-400">
                            {isOff
                              ? `Official station · ${officialAqi?.station ?? "CPCB"}`
                              : "Modeled · Open-Meteo"}
                          </p>
                          <PollutantGrid
                            official={isOff ? officialAqi : null}
                            modeled={modeledForTab}
                          />
                        </>
                      );
                    })()}
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="space-y-0.5 border-t border-white/60 px-5 py-3 text-[11px] text-slate-400">
              <p>Weather · Open-Meteo</p>
              <p>
                AQI ·{" "}
                {aqi.value != null
                  ? `${aqi.isOfficial ? "Official" : "Modeled"}${aqi.station ? ` · ${aqi.station}` : ""}`
                  : "—"}
              </p>
              {current && (
                <p className="flex items-center gap-1">
                  <Clock size={11} /> Observed {formatIstTime(current.observedAt)}
                </p>
              )}
              {coords && <p>{coords}</p>}
            </footer>
          </>
        )}
      </div>
    </aside>
  );
}
