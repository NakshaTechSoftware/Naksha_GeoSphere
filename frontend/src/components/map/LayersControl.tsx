"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { TerrainLegend } from "./TerrainLegend";

export type MapLayer = "default" | "satellite" | "terrain";

interface LayersControlProps {
  currentLayer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  className?: string;
}

/**
 * Google Maps-style layers control component
 * Positioned at bottom-left corner with a square preview button
 */
export function LayersControl({
  currentLayer,
  onLayerChange,
  className = "",
}: LayersControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
    <div className={`absolute bottom-6 left-6 z-10 ${className}`}>
      <div className="flex items-end gap-3 max-sm:flex-col-reverse max-sm:items-start">
        {isExpanded ? (
        // Expanded view - horizontal row of small square cards (Google Maps style)
        <div className="flex flex-row gap-2">
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

                {/* Layer Icon - Top Left */}
                <div className="absolute top-1.5 left-1.5">
                  <div className="w-7 h-7 rounded-lg bg-white shadow-md flex items-center justify-center">
                    <Layers className="w-3.5 h-3.5 text-gray-700" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Selected Check Mark - Top Right */}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                    <svg
                      className="w-3.5 h-3.5 text-white"
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

                {/* Layer Name - Bottom Center */}
                <div className="absolute bottom-0 left-0 right-0 pb-1">
                  <p className="text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-center leading-tight">
                    {layer.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        ) : (
        // Collapsed view - Small square button showing current layer preview
        <button
          onClick={() => setIsExpanded(true)}
          className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-105 ring-2 ring-white"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

          {/* Icon */}
          <div className="absolute top-1.5 left-1.5">
            <div className="w-7 h-7 rounded-lg bg-white shadow-md flex items-center justify-center">
              <Layers className="w-4 h-4 text-gray-700" strokeWidth={2.5} />
            </div>
          </div>

          {/* "Layers" Text */}
          <div className="absolute bottom-0 left-0 right-0 pb-1.5">
            <p className="text-xs font-bold text-white drop-shadow-lg text-center">
              Layers
            </p>
          </div>
        </button>
        )}
        {currentLayer === "terrain" && <TerrainLegend />}
      </div>
    </div>
  );
}
