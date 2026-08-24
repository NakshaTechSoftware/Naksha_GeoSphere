"use client";

import { useEffect, useState } from "react";
import { WeatherDetails } from "@/components/environment/WeatherDetails";
import { ApiUnavailableError, fetchWeather } from "@/lib/api-client";
import type { WeatherResponse } from "@/types/environment";

type LoadState = "loading" | "loaded" | "unavailable";

export interface WeatherCardProps {
  latitude: number;
  longitude: number;
}

export function WeatherCard({ latitude, longitude }: WeatherCardProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [weather, setWeather] = useState<WeatherResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");

    fetchWeather(latitude, longitude, controller.signal)
      .then((data) => {
        setWeather(data);
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

    return () => controller.abort();
  }, [latitude, longitude]);

  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-obsidian-graphite">Live Weather</h2>
        <span className="text-xs text-[var(--color-text-secondary)]">Open-Meteo</span>
      </div>

      {loadState === "loading" && (
        <p className="text-sm text-[var(--color-text-secondary)]" role="status">
          Loading weather…
        </p>
      )}

      {loadState === "unavailable" && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Live weather is temporarily unavailable.
        </p>
      )}

      {loadState === "loaded" && weather && (
        <WeatherDetails weather={weather} dataStatus={weather.dataStatus} />
      )}
    </div>
  );
}
