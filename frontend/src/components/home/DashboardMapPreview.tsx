"use client";

import { useState } from "react";
import { Search, MapPin, Plus, Minus, Navigation, X, Check } from "lucide-react";

interface Layer {
  id: string;
  name: string;
  active: boolean;
}

const initialLayers: Layer[] = [
  { id: "imagery", name: "Imagery", active: true },
  { id: "elevation", name: "Elevation", active: false },
  { id: "buildings", name: "Buildings", active: false },
  { id: "roads", name: "Roads", active: true },
  { id: "hydrography", name: "Hydrography", active: false },
  { id: "contours", name: "Contours", active: false },
];

const selectedArea = {
  name: "Downtown District, USA",
  badge: "Premium Imagery",
  resolution: "30 cm / 1 m",
  area: "12.45 km²",
  cloudCover: "2.1%",
  source: "Maxar Technologies",
  dateCaptured: "May 12, 2024",
};

export function DashboardMapPreview() {
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [searchValue, setSearchValue] = useState("");
  const [selectedCardOpen, setSelectedCardOpen] = useState(true);

  const toggleLayer = (layerId: string) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, active: !layer.active } : layer)),
    );
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="relative w-full overflow-hidden rounded-[var(--radius-large)] border border-[var(--color-border-medium)] shadow-map">
      <div className="relative aspect-[1.55/1] w-full bg-[#d4e4f7]">
        {/* Satellite-style background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#c9dcf1] via-[#d7e6f4] to-[#e6eff9]">
          <div
            className="h-full w-full opacity-[0.15]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(53, 99, 233, 0.35) 1px, transparent 1px),
                linear-gradient(90deg, rgba(53, 99, 233, 0.35) 1px, transparent 1px)
              `,
              backgroundSize: "36px 36px",
            }}
          />
        </div>

        {/* AOI Polygon */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points="27,42 66,35 72,63 32,70"
            fill="var(--color-cobalt-map-fill)"
            stroke="var(--color-atlas-cobalt)"
            strokeWidth="0.5"
          />
          {[
            [27, 42],
            [66, 35],
            [72, 63],
            [32, 70],
          ].map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="1.1"
              fill="white"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.4"
            />
          ))}
        </svg>

        {/* Search Bar */}
        <div className="absolute left-1/2 top-4 z-10 w-full max-w-xs -translate-x-1/2 px-4">
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 shadow-lg">
              <input
                type="text"
                placeholder="Search location"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="flex-1 bg-transparent text-sm text-obsidian-graphite placeholder-[var(--color-text-secondary)] focus:outline-none"
                aria-label="Search location"
              />
              <Search className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
            </div>
          </form>
        </div>

        {/* Layers Panel */}
        <div className="absolute left-4 top-4 z-10 w-40 rounded-lg bg-white p-3.5 shadow-lg">
          <h3 className="mb-2.5 text-sm font-semibold text-obsidian-graphite">Layers</h3>
          <div className="space-y-2">
            {layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className="flex w-full items-center gap-2 text-left text-sm text-obsidian-graphite/80 transition-colors hover:text-obsidian-graphite"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    layer.active
                      ? "border-atlas-cobalt bg-atlas-cobalt"
                      : "border-[var(--color-border-medium)] bg-white"
                  }`}
                >
                  {layer.active && <Check className="h-3 w-3 text-white" />}
                </span>
                <span>{layer.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-[var(--color-border-medium)] px-2 py-1.5 text-xs font-medium text-obsidian-graphite/70 transition-colors hover:bg-[var(--color-cobalt-soft)]"
          >
            <Plus className="h-3 w-3" />
            Add Layer
          </button>
        </div>

        {/* Selected Area Card */}
        {selectedCardOpen && (
          <div className="absolute right-4 top-4 z-10 w-64 rounded-lg bg-white p-4 shadow-lg">
            <div className="mb-1 flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                Selected Area
              </span>
              <button
                type="button"
                onClick={() => setSelectedCardOpen(false)}
                aria-label="Close selected area"
                className="text-[var(--color-text-secondary)] transition-colors hover:text-obsidian-graphite"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0 text-atlas-cobalt" />
              <span className="text-sm font-semibold text-obsidian-graphite">
                {selectedArea.name}
              </span>
            </div>

            <span className="mb-3 inline-flex items-center rounded-full bg-[var(--color-cobalt-soft)] px-2.5 py-1 text-xs font-medium text-atlas-cobalt">
              {selectedArea.badge}
            </span>

            <dl className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-text-secondary)]">Resolution</dt>
                <dd className="font-medium text-obsidian-graphite">{selectedArea.resolution}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-text-secondary)]">Area</dt>
                <dd className="font-medium text-obsidian-graphite">{selectedArea.area}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-text-secondary)]">Cloud Cover</dt>
                <dd className="font-medium text-obsidian-graphite">{selectedArea.cloudCover}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-text-secondary)]">Source</dt>
                <dd className="font-medium text-obsidian-graphite">{selectedArea.source}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--color-text-secondary)]">Date Captured</dt>
                <dd className="font-medium text-obsidian-graphite">
                  {selectedArea.dateCaptured}
                </dd>
              </div>
            </dl>

            <a
              href="/datasets/downtown-district"
              className="mt-4 flex w-full items-center justify-center rounded-lg bg-atlas-cobalt py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)]"
            >
              View Dataset
            </a>
          </div>
        )}

        {/* Zoom / navigation controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-lg bg-white shadow-lg">
          <button
            type="button"
            aria-label="Recenter"
            className="flex h-9 w-9 items-center justify-center border-b border-[var(--color-border-subtle)] text-obsidian-graphite/70 transition-colors hover:bg-[var(--color-cobalt-soft)]"
          >
            <Navigation className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="flex h-9 w-9 items-center justify-center border-b border-[var(--color-border-subtle)] text-obsidian-graphite/70 transition-colors hover:bg-[var(--color-cobalt-soft)]"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            className="flex h-9 w-9 items-center justify-center text-obsidian-graphite/70 transition-colors hover:bg-[var(--color-cobalt-soft)]"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
