"use client";

import { useEffect, useState } from "react";
import { ModeledAqiDetails } from "@/components/environment/ModeledAqiDetails";
import { ApiUnavailableError, fetchAirQuality } from "@/lib/api-client";
import type { AirQualityResponse } from "@/types/environment";

type LoadState = "loading" | "loaded" | "unavailable";

export interface ModeledAirQualityCardProps {
  latitude: number;
  longitude: number;
}

export function ModeledAirQualityCard({ latitude, longitude }: ModeledAirQualityCardProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [airQuality, setAirQuality] = useState<AirQualityResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");

    fetchAirQuality(latitude, longitude, controller.signal)
      .then((data) => {
        setAirQuality(data);
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
        <h2 className="text-base font-semibold text-obsidian-graphite">Modeled Air Quality</h2>
        <span className="text-xs text-[var(--color-text-secondary)]">Open-Meteo · Modeled</span>
      </div>

      {loadState === "loading" && (
        <p className="text-sm text-[var(--color-text-secondary)]" role="status">
          Loading modeled air quality…
        </p>
      )}

      {loadState === "unavailable" && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Modeled air-quality information is temporarily unavailable.
        </p>
      )}

      {loadState === "loaded" && airQuality && (
        <ModeledAqiDetails airQuality={airQuality} dataStatus={airQuality.dataStatus} />
      )}
    </div>
  );
}
