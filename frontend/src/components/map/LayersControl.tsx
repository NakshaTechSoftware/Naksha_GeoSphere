"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { TerrainLegend } from "./TerrainLegend";

export type MapLayer = "default" | "satellite" | "terrain";

interface LayersControlProps {
  currentLayer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  className?: string;
  /** Google-Earth-style independent toggle for the base map's own place-name labels */
  placeLabelsVisible?: boolean;
  onTogglePlaceLabels?: (visible: boolean) => void;
  /** Auto-expands the picker once whenever this flips from false to true */
  autoExpand?: boolean;
  /** Whether the small stacked-layers badge icon is shown */
  showBadgeIcon?: boolean;
  /** Controlled mode: when true, the panel is expanded; when false, collapsed.
   *  When not provided, the panel manages its own expand/collapse state. */
  isExpanded?: boolean;
  onToggle?: (isExpanded: boolean) => void;
}

/**
 * Google Maps-style layers control component
 * Positioned at bottom-left on desktop, bottom-right on mobile
 */
export function LayersControl({
  currentLayer,
  onLayerChange,
  className = "",
  placeLabelsVisible = true,
  onTogglePlaceLabels,
  autoExpand,
  showBadgeIcon = true,
  isExpanded: controlledIsExpanded,
  onToggle,
}: LayersControlProps) {
  // Controlled mode: use provided isExpanded; otherwise manage internally.
  const [isExpandedLocal, setIsExpandedLocal] = controlledIsExpanded !== undefined
    ? [controlledIsExpanded, () => {}]
    : useState(false);
  const setIsExpanded = (value: boolean) => {
    if (controlledIsExpanded !== undefined) {
      onToggle?.(value);
    } else {
      setIsExpandedLocal(value);
    }
  };

  useEffect(() => {
    if (autoExpand) setIsExpanded(true);
  }, [autoExpand]);

  const layers = [
    {
      id: "default" as MapLayer,
      name: "Default",
      previewBg: "bg-gradient-to-b from-gray-100 via-gray-200 to-gray-400",
      previewImage: "/map-previews/default.png",
    },
    {
      id: "satellite" as MapLayer,
      name: "Satellite",
      previewBg: "bg-gradient-to-br from-green-950 via-green-900 to-green-800",
      previewImage: "/map-previews/satellite.png",
    },
    {
      id: "terrain" as MapLayer,
      name: "Terrain",
      previewBg: "bg-gradient-to-b from-yellow-100 via-amber-200 to-stone-400",
      previewImage: null as string | null,
    },
  ];

  const currentLayerData = layers.find((l) => l.id === currentLayer) ?? layers[0];

  return (
    <div
      className={`absolute bottom-6 left-6 z-10 max-md:bottom-[42px] max-md:left-auto max-md:right-2.5 ${className}`}
    >
      <div className="flex items-end gap-3 max-md:flex-col-reverse max-md:items-end">
        {/* Layer option cards & toggles */}
        <div
          className={`relative z-10 flex flex-row gap-2 max-md:flex max-md:flex-col max-md:gap-2 max-md:overflow-hidden max-md:p-1 max-md:transition-all max-md:duration-300 max-md:ease-out ${
            isExpandedLocal
              ? "max-md:max-h-48 max-md:opacity-100"
              : "max-md:max-h-0 max-md:opacity-0"
          } ${isExpandedLocal ? "" : "hidden"}`}
        >
          <div className="flex flex-row gap-2 max-md:flex-col max-md:gap-2 max-md:overflow-hidden max-md:p-1">
            {layers.map((layer) => {
              const isSelected = currentLayer === layer.id;
              return (
                <button
                  key={layer.id}
                  onClick={() => {
                    onLayerChange(layer.id);
                    setIsExpanded(false);
                  }}
                  className={`
                    relative h-20 w-20 overflow-hidden rounded-xl transition-all
                    max-md:h-11 max-md:w-11 max-md:rounded-lg
                    ${
                      isSelected
                        ? "shadow-xl ring-[3px] ring-blue-500"
                        : "shadow-md ring-2 ring-white hover:shadow-lg"
                    }
                  `}
                  aria-label={`Switch to ${layer.name} view`}
                >
                  {/* Preview Background */}
                  {layer.previewImage ? (
                    <img
                      src={layer.previewImage}
                      alt={`${layer.name} preview`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className={`absolute inset-0 ${layer.previewBg}`} />
                  )}

                  {/* Subtle overlay for depth */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                  {/* Layer Icon - Top Left (desktop only) */}
                  {showBadgeIcon && (
                    <div className="absolute left-1.5 top-1.5 max-md:hidden">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-md">
                        <Layers className="h-3.5 w-3.5 text-gray-700" strokeWidth={2.5} />
                      </div>
                    </div>
                  )}

                  {/* Selected Check Mark - Top Right (desktop only) */}
                  {isSelected && (
                    <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 shadow-lg max-md:hidden">
                      <svg
                        className="h-3.5 w-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* Layer Name - Bottom Center (desktop only) */}
                  <div className="absolute bottom-0 left-0 right-0 pb-1 max-md:hidden">
                    <p className="text-center text-[11px] font-bold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {layer.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Place names checkbox toggle (desktop only) */}
          <label className="flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md max-md:hidden">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={placeLabelsVisible}
              onChange={(e) => onTogglePlaceLabels?.(e.target.checked)}
            />
            Place names
          </label>
        </div>

        {/* Collapsed anchor button */}
        <button
          onClick={() => setIsExpanded(!isExpandedLocal)}
          className={`relative w-20 h-20 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-105 ring-2 ring-white max-md:w-11 max-md:h-11 max-md:rounded-lg max-md:order-first ${
            isExpandedLocal ? "hidden" : ""
          }`}
          aria-label="Open map layers"
        >
          {/* Current Layer Preview */}
          {currentLayerData?.previewImage ? (
            <img
              src={currentLayerData.previewImage}
              alt={`${currentLayerData.name} preview`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className={`absolute inset-0 ${
                currentLayerData?.previewBg ??
                "bg-gradient-to-b from-gray-100 via-gray-200 to-gray-400"
              }`}
            />
          )}

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent max-md:hidden" />

          {/* Icon */}
          {showBadgeIcon && (
            <div className="absolute left-1.5 top-1.5 max-md:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-md">
                <Layers className="h-4 w-4 text-gray-700" strokeWidth={2.5} />
              </div>
            </div>
          )}

          {/* "Layers" Text */}
          <div className="absolute bottom-0 left-0 right-0 pb-1.5 max-md:hidden">
            <p className="text-center text-xs font-bold text-white drop-shadow-lg">
              Layers
            </p>
          </div>
        </button>

        {currentLayer === "terrain" && <TerrainLegend />}
      </div>

      {/* Mobile-only backdrop: while the picker is open the anchor button (the usual
          close affordance) is hidden, so tapping anywhere else on the map closes it. */}
      {isExpandedLocal && (
        <div
          className="fixed inset-0 z-0 hidden max-md:block"
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}