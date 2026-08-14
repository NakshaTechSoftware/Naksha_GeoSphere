"use client";

import { useEffect, useState } from "react";
import { OfficialAqiDetails } from "@/components/environment/OfficialAqiDetails";
import { ApiUnavailableError, fetchLocationSummary } from "@/lib/api-client";
import type { OfficialAqiSection } from "@/types/environment";

type LoadState = "loading" | "loaded" | "unavailable";

export interface OfficialAirQualityCardProps {
  latitude: number;
  longitude: number;
}

export function OfficialAirQualityCard({ latitude, longitude }: OfficialAirQualityCardProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [section, setSection] = useState<OfficialAqiSection | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");

    fetchLocationSummary(latitude, longitude, controller.signal)
      .then((data) => {
        setSection(data.officialAirQuality);
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
        <h2 className="text-base font-semibold text-obsidian-graphite">Official Air Quality</h2>
        <span className="text-xs text-[var(--color-text-secondary)]">CPCB / data.gov.in</span>
      </div>

      {loadState === "loading" && (
        <p className="text-sm text-[var(--color-text-secondary)]" role="status">
          Loading official AQI…
        </p>
      )}

      {(loadState === "unavailable" || section?.status === "UNAVAILABLE") && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {section?.message ?? "Official AQI station data is temporarily unavailable."}
        </p>
      )}

      {loadState === "loaded" && section?.status === "AVAILABLE" && section.data && (
        <OfficialAqiDetails
          station={section.data}
          distanceKm={section.distanceKm}
          dataStatus={section.dataStatus}
        />
      )}
    </div>
  );
}
