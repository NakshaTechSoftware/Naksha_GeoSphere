"use client";

import { useEffect, useState } from "react";
import { ModeledAqiDetails } from "@/components/environment/ModeledAqiDetails";
import { OfficialAqiDetails } from "@/components/environment/OfficialAqiDetails";
import { WeatherDetails } from "@/components/environment/WeatherDetails";
import { ApiUnavailableError, fetchLocationSummary } from "@/lib/api-client";
import type { LocationSummaryResponse } from "@/types/environment";

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
    <section className="border-t border-[var(--color-border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The "click anywhere" environment panel (spec section M/AE): given a
 * coordinate, shows live weather, the nearest official CPCB station
 * (clearly distance-labeled, never implied to be at the exact point
 * clicked), and Open-Meteo's modeled air quality — each visually and
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

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");

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

    return () => controller.abort();
  }, [latitude, longitude]);

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

      {loadState === "loading" && (
        <p className="text-sm text-[var(--color-text-secondary)]" role="status">
          Loading environmental data…
        </p>
      )}

      {loadState === "unavailable" && (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Environmental information is temporarily unavailable for this location.
        </p>
      )}

      {loadState === "loaded" && summary && (
        <div className="space-y-4">
          <Section title="Live Weather">
            {summary.weather.status === "AVAILABLE" && summary.weather.data ? (
              <WeatherDetails weather={summary.weather.data} dataStatus={summary.weather.dataStatus} />
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {summary.weather.message ?? "Live weather is temporarily unavailable."}
              </p>
            )}
          </Section>

          <Section title="Official Air Quality">
            {summary.officialAirQuality.status === "AVAILABLE" && summary.officialAirQuality.data ? (
              <OfficialAqiDetails
                station={summary.officialAirQuality.data}
                distanceKm={summary.officialAirQuality.distanceKm}
                dataStatus={summary.officialAirQuality.dataStatus}
              />
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {summary.officialAirQuality.message ??
                  "Official AQI station data is temporarily unavailable."}
              </p>
            )}
          </Section>

          <Section title="Modeled Air Quality">
            {summary.modeledAirQuality.status === "AVAILABLE" && summary.modeledAirQuality.data ? (
              <ModeledAqiDetails
                airQuality={summary.modeledAirQuality.data}
                dataStatus={summary.modeledAirQuality.dataStatus}
              />
            ) : (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {summary.modeledAirQuality.message ??
                  "Modeled air-quality information is temporarily unavailable."}
              </p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
