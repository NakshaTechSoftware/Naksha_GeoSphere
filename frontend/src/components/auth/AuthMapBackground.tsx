"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Configures maplibre's GeoJSON worker for Next.js (must run before any map is created).
// This decorative raster-only map still needs it: maplibre spawns its worker pool at map
// construction, and if that happens with the default (Next.js-broken) worker URL, every
// later GeoJSON map in the same page session - e.g. the Explore page reached by a
// client-side navigation from this sign-in screen - silently fails to load its layers.
import { configureMaplibreWorker } from "../../lib/maplibreWorker";

export interface MapBackdropLocation {
  center: [number, number];
  zoom: number;
}

// Tritone lookup: maps grayscale luminance (0 = shadow, 1 = highlight) onto
// three brand colors — dark blue -> light blue -> white — via an SVG
// feComponentTransfer table, so the satellite imagery reads as a stylized
// three-color map instead of full-color photography.
const TRITONE_STOPS = {
  r: "0.039 0.310 1",
  g: "0.122 0.525 1",
  b: "0.267 0.776 1",
};

interface AuthMapBackgroundProps {
  locations: MapBackdropLocation[];
  /** Unique per page — SVG filter ids must not collide if both auth pages are ever rendered together. */
  filterId: string;
}

export function AuthMapBackground({ locations, filterId }: AuthMapBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [location] = useState(
    () => locations[Math.floor(Math.random() * locations.length)]!,
  );

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!containerRef.current) return;

      const maplibregl = await import("maplibre-gl");
      if (cancelled || !containerRef.current) return;

      configureMaplibreWorker();
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            "satellite-base": {
              type: "raster",
              // Esri World Imagery: no API key needed, already used elsewhere in
              // this codebase (see globe-workflow/map/mapSources.ts) and far more
              // reliable for automated/headless contexts than Google's
              // undocumented mt0/mt1 tile endpoint, which intermittently
              // rejected requests here.
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
            },
          },
          layers: [{ id: "satellite-base-layer", type: "raster", source: "satellite-base" }],
        },
        center: location.center,
        zoom: location.zoom,
        pitch: 0,
        bearing: 0,
        interactive: false,
        attributionControl: false,
      });

      // Purely decorative background — a failed tile fetch should never
      // surface as an uncaught console error / dev-overlay issue.
      map.on("error", () => {});

      mapRef.current = map;
    }

    void initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [location]);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Hidden SVG filter that recolors the grayscale satellite imagery into
          a dark-blue / light-blue / white tritone. */}
      <svg width="0" height="0" className="absolute">
        <filter id={filterId}>
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={TRITONE_STOPS.r} />
            <feFuncG type="table" tableValues={TRITONE_STOPS.g} />
            <feFuncB type="table" tableValues={TRITONE_STOPS.b} />
          </feComponentTransfer>
        </filter>
      </svg>

      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, filter: `url(#${filterId})` }}
      />

      {/* Dark navy scrim so the white foreground text stays legible over the
          imagery — using an inline style instead of a Tailwind opacity
          class since arbitrary bg-opacity utilities aren't reliably picked
          up here. */}
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(8, 20, 46, 0.55)" }} />
    </div>
  );
}
