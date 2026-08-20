"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { TerrainLegend } from "./TerrainLegend";

export type MapLayer = "default" | "satellite" | "terrain";

interface LayersControlProps {
  currentLayer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  className?: string;
  /** Whether the small stacked-layers badge icon (top-left corner of each preview tile)
   *  is shown. Defaults to true; the Explore page turns it off and keeps just the preview
   *  thumbnail + "Layers" label. */
  showBadgeIcon?: boolean;
  /** Controlled mode: when true, the panel is expanded; when false, collapsed.
   *  When not provided, the panel manages its own expand/collapse state. */
  isExpanded?: boolean;
  onToggle?: (isExpanded: boolean) => void;
}

/**
 * Google Maps-style layers control component
 * Positioned at bottom-left corner with a square preview button
 */
export function LayersControl({
  currentLayer,
  onLayerChange,
  className = "",
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
      className={`absolute bottom-6 left-6 z-10 max-md:left-auto max-md:right-2.5 max-md:bottom-[42px] ${className}`}
    >
      <div className="flex items-end gap-3 max-md:flex-col-reverse max-md:items-end">
        {/* Layer option cards. Desktop: shown in place of the anchor button while
            expanded (Google Maps style, unchanged). Mobile (common phone resolutions):
            always in the layout as a vertical column of icon-sized buttons that
            smoothly expands/collapses below the anchor button (max-height + opacity
            transition). */}
        <div
          className={`relative z-10 flex flex-row gap-2 max-md:flex max-md:flex-col max-md:gap-2 max-md:overflow-hidden max-md:p-1 max-md:transition-all max-md:duration-300 max-md:ease-out ${
            isExpandedLocal
              ? "max-md:max-h-48 max-md:opacity-100"
              : "max-md:max-h-0 max-md:opacity-0"
          } ${isExpandedLocal ? "" : "hidden"}`}
        >
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
                  relative w-20 h-20 rounded-xl overflow-hidden transition-all
                  max-md:w-11 max-md:h-11 max-md:rounded-lg
                  ${
                    isSelected
                      ? "ring-[3px] ring-blue-500 shadow-xl"
                      : "ring-2 ring-white shadow-md hover:shadow-lg"
                  }
                `}
                aria-label={`Switch to ${layer.name} view`}
              >
                {/* Preview Background */}
                {layer.previewImage ? (
                  <img
                    src={layer.previewImage}
                    alt={`${layer.name} preview`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className={`absolute inset-0 ${layer.previewBg}`} />
                )}

                {/* Subtle overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

                {/* Layer Icon - Top Left (hidden on mobile to match the anchor button) */}
                {showBadgeIcon && (
                  <div className="absolute top-1.5 left-1.5 max-md:hidden">
                    <div className="w-7 h-7 rounded-lg bg-white shadow-md flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5 text-gray-700" strokeWidth={2.5} />
                    </div>
                  </div>
                )}

                {/* Selected Check Mark - Top Right (hidden on mobile - the blue ring
                    alone marks the selection there) */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg max-md:w-4 max-md:h-4 max-md:top-1 max-md:right-1 max-md:hidden">
                    <svg
                      className="w-3.5 h-3.5 text-white max-md:w-2.5 max-md:h-2.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}

                {/* Layer Name - Bottom Center (hidden on mobile - icon-only options) */}
                <div className="absolute bottom-0 left-0 right-0 pb-1 max-md:pb-0.5 max-md:hidden">
                  <p className="text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-center leading-tight max-md:text-[9px]">
                    {layer.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Collapsed anchor button. Hidden while the picker is open (all sizes) so the
            options are the only things shown - on mobile the current-layer preview
            would otherwise appear as a 4th tile duplicating one of the options. The
            mobile backdrop below closes the picker without picking a layer. */}
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
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className={`absolute inset-0 ${currentLayerData?.previewBg ?? 'bg-gradient-to-b from-gray-100 via-gray-200 to-gray-400'}`} />
          )}

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent max-md:hidden" />

          {/* Icon */}
          {showBadgeIcon && (
            <div className="absolute top-1.5 left-1.5 max-md:hidden">
              <div className="w-7 h-7 rounded-lg bg-white shadow-md flex items-center justify-center">
                <Layers className="w-4 h-4 text-gray-700" strokeWidth={2.5} />
              </div>
            </div>
          )}

          {/* "Layers" Text */}
          <div className="absolute bottom-0 left-0 right-0 pb-1.5 max-md:hidden">
            <p className="text-xs font-bold text-white drop-shadow-lg text-center">
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
