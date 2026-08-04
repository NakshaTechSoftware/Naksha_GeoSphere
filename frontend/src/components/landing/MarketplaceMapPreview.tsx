"use client";

import { useState } from "react";
import {
  Search,
  Layers,
  Image,
  Mountain,
  Building,
  Route,
  Waves,
  TreePine,
  MapPin,
  Plus,
  MousePointer2,
  Square,
  Crosshair,
  Ruler,
  ZoomIn,
  ZoomOut,
  Check,
} from "lucide-react";

interface Layer {
  id: string;
  name: string;
  icon: typeof Image;
  active: boolean;
}

const initialLayers: Layer[] = [
  { id: "imagery", name: "Imagery", icon: Image, active: true },
  { id: "elevation", name: "Elevation", icon: Mountain, active: true },
  { id: "buildings", name: "Buildings", icon: Building, active: false },
  { id: "roads", name: "Roads", icon: Route, active: false },
  { id: "hydrography", name: "Hydrography", icon: Waves, active: false },
  { id: "landuse", name: "Land Use", icon: TreePine, active: false },
  { id: "contours", name: "Contours", icon: MapPin, active: false },
];

interface MapTab {
  id: string;
  label: string;
  active: boolean;
}

const mapTabs: MapTab[] = [
  { id: "imagery", label: "Imagery", active: true },
  { id: "elevation", label: "Elevation", active: false },
  { id: "contours", label: "Contours", active: false },
  { id: "3d", label: "3D View", active: false },
];

const toolbarTools = [
  { id: "pointer", icon: MousePointer2, label: "Select" },
  { id: "rectangle", icon: Square, label: "Rectangle Selection" },
  { id: "location", icon: Crosshair, label: "Location" },
  { id: "measurement", icon: Ruler, label: "Measurement" },
  { id: "layers", icon: Layers, label: "Layers" },
  { id: "zoom-in", icon: ZoomIn, label: "Zoom In" },
  { id: "zoom-out", icon: ZoomOut, label: "Zoom Out" },
];

export function MarketplaceMapPreview() {
  const [layers, setLayers] = useState<Layer[]>(initialLayers);
  const [activeTool, setActiveTool] = useState("pointer");
  const [activeTab, setActiveTab] = useState("imagery");
  const [searchValue, setSearchValue] = useState("");

  const toggleLayer = (layerId: string) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === layerId ? { ...layer, active: !layer.active } : layer)),
    );
  };

  const activeLayers = layers.filter((l) => l.active);
  const activeLayerNames = activeLayers.map((l) => l.name);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo message
    if (searchValue.trim()) {
      alert("Full location search will be connected in the map workspace.");
    }
  };

  return (
    <div className="relative flex items-start">
      <div className="w-full overflow-hidden rounded-[var(--radius-large)] border border-[var(--color-border-medium)] shadow-map">
        {/* Map Container */}
        <div className="relative aspect-[1.75/1] w-full bg-[#d4e4f7]">
          {/* Fallback map background - replace with MapLibre when configured */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#c8ddf4] via-[#d4e4f7] to-[#e1edf9]">
            {/* Grid pattern */}
            <div
              className="h-full w-full opacity-10"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(53, 99, 233, 0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(53, 99, 233, 0.3) 1px, transparent 1px)
                `,
                backgroundSize: "50px 50px",
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
              points="25,35 70,30 75,65 30,70"
              fill="var(--color-cobalt-map-fill)"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.5"
            />
            {/* Vertex handles */}
            <circle
              cx="25"
              cy="35"
              r="1.2"
              fill="white"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.3"
            />
            <circle
              cx="70"
              cy="30"
              r="1.2"
              fill="white"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.3"
            />
            <circle
              cx="75"
              cy="65"
              r="1.2"
              fill="white"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.3"
            />
            <circle
              cx="30"
              cy="70"
              r="1.2"
              fill="white"
              stroke="var(--color-atlas-cobalt)"
              strokeWidth="0.3"
            />
          </svg>

          {/* Search Bar */}
          <div className="absolute left-1/2 top-6 z-10 w-full max-w-sm -translate-x-1/2 px-4">
            <form onSubmit={handleSearch}>
              <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 shadow-lg">
                <Search className="h-4 w-4 text-[var(--color-text-secondary)]" />
                <input
                  type="text"
                  placeholder="Search location"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-obsidian-graphite placeholder-[var(--color-text-secondary)] focus:outline-none"
                  aria-label="Search location"
                />
              </div>
            </form>
          </div>

          {/* Left: Layer Panel */}
          <div className="bg-obsidian-graphite/95 absolute left-4 top-20 z-10 w-48 rounded-lg p-4 shadow-lg backdrop-blur-sm">
            <h3 className="mb-3 text-sm font-semibold text-white">Layers</h3>
            <div className="space-y-2">
              {layers.map((layer) => {
                const Icon = layer.icon;
                return (
                  <button
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white/80 transition-colors hover:bg-white/10"
                  >
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded border ${
                        layer.active ? "border-atlas-cobalt bg-atlas-cobalt" : "border-white/40"
                      }`}
                    >
                      {layer.active && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{layer.name}</span>
                  </button>
                );
              })}
            </div>
            <button className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-white/20 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10">
              <Plus className="h-3 w-3" />
              Add Layer
            </button>
          </div>

          {/* Right: Toolbar */}
          <div className="bg-obsidian-graphite/95 absolute right-4 top-20 z-10 flex flex-col gap-1 rounded-lg p-2 shadow-lg backdrop-blur-sm">
            {toolbarTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={`rounded p-2 transition-colors ${
                    activeTool === tool.id
                      ? "bg-atlas-cobalt text-white"
                      : "text-white/80 hover:bg-white/10"
                  }`}
                  title={tool.label}
                  aria-label={tool.label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {/* Top Right: Selected Data Card */}
          <div className="bg-obsidian-graphite/95 absolute right-4 top-4 z-10 w-56 rounded-lg p-4 shadow-lg backdrop-blur-sm">
            <h3 className="mb-3 text-sm font-semibold text-white">Selected Data</h3>

            <div className="mb-3 space-y-2">
              <div>
                <p className="text-xs text-white/60">Layers</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {activeLayerNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full bg-atlas-cobalt px-2 py-0.5 text-xs text-white"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/10 pt-2">
                <p className="text-xs text-white/60">Area</p>
                <p className="text-sm font-semibold text-white">12.45 km²</p>
              </div>

              <div>
                <p className="text-xs text-white/60">Resolution</p>
                <p className="text-sm font-semibold text-white">30 cm / 1 m</p>
              </div>

              <div className="border-t border-white/10 pt-2">
                <p className="text-xs text-white/60">Total Price</p>
                <p className="text-lg font-bold text-white">$1,245.00 USD</p>
              </div>
            </div>

            <button
              onClick={() =>
                alert("Marketplace checkout will be connected in the purchasing phase.")
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-atlas-cobalt px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)]"
            >
              <span>Add to Cart</span>
            </button>
          </div>

          {/* Bottom: Preview Tabs */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {mapTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group relative overflow-hidden rounded-lg border transition-all ${
                  activeTab === tab.id
                    ? "border-atlas-cobalt"
                    : "border-white/30 hover:border-white/50"
                }`}
              >
                <div className="h-16 w-20 bg-gradient-to-br from-[#c8ddf4] to-[#e1edf9]" />
                <div className="bg-obsidian-graphite/90 absolute inset-x-0 bottom-0 flex items-center justify-center py-1">
                  <span className="text-xs font-medium text-white">{tab.label}</span>
                  {activeTab === tab.id && (
                    <div className="absolute -right-1 -top-1 rounded-full bg-atlas-cobalt p-0.5">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
