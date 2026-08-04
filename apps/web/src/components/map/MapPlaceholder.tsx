"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Minimal MapLibre GL JS bootstrap used only to prove the map engine is
 * wired up correctly. Uses the free MapLibre demotiles style so no paid
 * map token is required. The real dataset-exploration map ships in a
 * later phase.
 */
export function MapPlaceholder() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      try {
        const maplibregl = await import("maplibre-gl");

        if (cancelled || !containerRef.current) return;

        mapRef.current = new maplibregl.Map({
          container: containerRef.current,
          style: "https://demotiles.maplibre.org/style.json",
          center: [0, 20],
          zoom: 1.4,
          attributionControl: false,
        });

        mapRef.current.on("error", () => setFailed(true));
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void initMap();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-mist-border)] bg-spatial-navy">
      <div ref={containerRef} className="absolute inset-0" role="img" aria-label="World map preview" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-spatial-navy text-sm text-cloud-mist/70">
          Map preview unavailable — the marketplace map ships in a later phase.
        </div>
      )}
    </div>
  );
}
