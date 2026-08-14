"use client";

import { useEffect, useState } from "react";
import { AqiStationsMap } from "@/components/environment/AqiStationsMap";
import { LocationEnvironmentPanel } from "@/components/environment/LocationEnvironmentPanel";
import { ModeledAirQualityCard } from "@/components/environment/ModeledAirQualityCard";
import { OfficialAirQualityCard } from "@/components/environment/OfficialAirQualityCard";
import { WeatherCard } from "@/components/environment/WeatherCard";
import { getStoredUserLocation } from "@/lib/userSession";

// Default dashboard view only — every card and the map itself work for any
// valid coordinate; click the map to look up weather/AQI anywhere.
const DEFAULT_LOCATION = { latitude: 12.9716, longitude: 77.5946 };

export interface EnvironmentDashboardProps {
  latitude?: number;
  longitude?: number;
}

export function EnvironmentDashboard({
  latitude,
  longitude,
}: EnvironmentDashboardProps) {
  const [selected, setSelected] = useState<{ latitude: number; longitude: number } | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState(() => ({
    latitude: latitude ?? DEFAULT_LOCATION.latitude,
    longitude: longitude ?? DEFAULT_LOCATION.longitude,
  }));

  useEffect(() => {
    if (typeof latitude === "number" && typeof longitude === "number") {
      setResolvedLocation({ latitude, longitude });
      return;
    }

    const saved = getStoredUserLocation();
    if (saved) {
      setResolvedLocation({ latitude: saved.latitude, longitude: saved.longitude });
      return;
    }

    setResolvedLocation(DEFAULT_LOCATION);
  }, [latitude, longitude]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-obsidian-graphite">Weather &amp; Air Quality</h2>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Showing environmental data for {resolvedLocation.latitude.toFixed(4)},{" "}
        {resolvedLocation.longitude.toFixed(4)}.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <WeatherCard latitude={resolvedLocation.latitude} longitude={resolvedLocation.longitude} />
        <OfficialAirQualityCard
          latitude={resolvedLocation.latitude}
          longitude={resolvedLocation.longitude}
        />
        <ModeledAirQualityCard
          latitude={resolvedLocation.latitude}
          longitude={resolvedLocation.longitude}
        />
      </div>

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
