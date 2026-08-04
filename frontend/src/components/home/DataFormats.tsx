import { Image, Layers, Globe2, Braces, Box, Mountain } from "lucide-react";

interface DataFormat {
  id: string;
  icon: typeof Image;
  name: string;
  category: string;
}

const formats: DataFormat[] = [
  { id: "geotiff", icon: Image, name: "GeoTIFF", category: "Raster" },
  { id: "shapefile", icon: Layers, name: "Shapefile", category: "Vector" },
  { id: "kml", icon: Globe2, name: "KML / KMZ", category: "Visualization" },
  { id: "geojson", icon: Braces, name: "GeoJSON", category: "Vector" },
  { id: "las", icon: Box, name: "LAS / LAZ", category: "Point Cloud" },
  { id: "dem", icon: Mountain, name: "DEM / DTM", category: "Elevation" },
];

export function DataFormats() {
  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <h2 className="mb-4 text-base font-semibold text-obsidian-graphite">Data Formats</h2>
      <div className="grid grid-cols-3 gap-3">
        {formats.map((format) => {
          const Icon = format.icon;
          return (
            <div
              key={format.id}
              className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border-subtle)] px-3 py-4 text-center"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-cobalt-soft)] text-atlas-cobalt">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-obsidian-graphite">{format.name}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {format.category}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
