import { FileText, Grid3x3, Braces, Layers, Mountain, Scan } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface DataFormat {
  id: string;
  icon: LucideIcon;
  name: string;
  subtitle: string;
}

const dataFormats: DataFormat[] = [
  {
    id: "kml-kmz",
    icon: FileText,
    name: "KML / KMZ",
    subtitle: "Google Earth Formats",
  },
  {
    id: "geotiff",
    icon: Grid3x3,
    name: "GeoTIFF",
    subtitle: "Georeferenced Rasters",
  },
  {
    id: "geojson",
    icon: Braces,
    name: "GeoJSON",
    subtitle: "Vector Data Format",
  },
  {
    id: "shapefile",
    icon: Layers,
    name: "Shapefile",
    subtitle: "ESRI Vector Format",
  },
  {
    id: "dem-dsm-dtm",
    icon: Mountain,
    name: "DEM / DSM / DTM",
    subtitle: "Elevation Models & Terrain",
  },
  {
    id: "las-laz",
    icon: Scan,
    name: "LAS / LAZ",
    subtitle: "LiDAR Point Clouds",
  },
];

export function DataFormatsSection() {
  return (
    <section id="data-formats" className="bg-polar-pearl py-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card lg:p-12">
          <h2 className="mb-10 text-center text-3xl font-bold text-obsidian-graphite">
            Data Formats & Products
          </h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dataFormats.map((format) => {
              const Icon = format.icon;
              return (
                <div
                  key={format.id}
                  className="hover:border-atlas-cobalt/30 group flex flex-col items-center rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 text-center transition-all hover:bg-[var(--color-cobalt-soft)]"
                >
                  <div className="group-hover:bg-atlas-cobalt/20 mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-cobalt-soft)] transition-colors">
                    <Icon className="h-6 w-6 text-atlas-cobalt" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-1 text-base font-semibold text-obsidian-graphite">
                    {format.name}
                  </h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">{format.subtitle}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
