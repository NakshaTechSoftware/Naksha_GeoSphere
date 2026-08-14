"use client";

import React, { useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import { PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon } from "./WeatherIcons";
import type { DailyForecastDay } from "@/types/environment";

interface ForecastTimelineProps {
  days: DailyForecastDay[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  className?: string;
}

function formatDay(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tmrw";

    return d.toLocaleDateString("en-US", { weekday: "short" });
  } catch {
    return dateStr.slice(5);
  }
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getWeatherEmoji(code: number | null): string {
  if (code == null) return "—";
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 49) return "☁️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 99) return "⛈️";
  return "—";
}

export function ForecastTimeline({
  days,
  activeIndex,
  onIndexChange,
  isPlaying,
  onPlayToggle,
  className,
}: ForecastTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToActive = useCallback(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.children[activeIndex] as HTMLElement | undefined;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeIndex]);

  useEffect(() => {
    scrollToActive();
  }, [scrollToActive]);

  if (days.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-2xl border border-white/40 bg-white/85 px-3 py-2 shadow-lg backdrop-blur-xl",
        className
      )}
    >
      {/* Play/Pause */}
      <button
        onClick={onPlayToggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-md transition-colors hover:bg-blue-600"
        title={isPlaying ? "Pause" : "Play forecast"}
      >
        {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </button>

      {/* Prev */}
      <button
        onClick={() => onIndexChange(Math.max(0, activeIndex - 1))}
        disabled={activeIndex === 0}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
      >
        <ChevronLeftIcon size={16} />
      </button>

      {/* Day pills */}
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {days.map((day, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={day.date}
              onClick={() => onIndexChange(i)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200 shrink-0",
                isActive
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              <span className="text-[10px] font-semibold">{formatDay(day.date)}</span>
              <span className="text-sm">{getWeatherEmoji(day.weatherCode)}</span>
              <span className="text-[10px]">
                {day.temperatureMaxC != null ? `${Math.round(day.temperatureMaxC)}°` : "—"}
                {" / "}
                {day.temperatureMinC != null ? `${Math.round(day.temperatureMinC)}°` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Next */}
      <button
        onClick={() => onIndexChange(Math.min(days.length - 1, activeIndex + 1))}
        disabled={activeIndex === days.length - 1}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
      >
        <ChevronRightIcon size={16} />
      </button>

      {/* Active date label */}
      {days[activeIndex] && (
        <div className="shrink-0 pl-2 text-right">
          <p className="text-[10px] font-medium text-gray-400">
            {formatShortDate(days[activeIndex].date)}
          </p>
          {days[activeIndex].precipitationProbabilityMax != null && (
            <p className="text-[10px] text-blue-500 font-semibold">
              {days[activeIndex].precipitationProbabilityMax}% rain
            </p>
          )}
        </div>
      )}
    </div>
  );
}
