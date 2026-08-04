import { ShoppingCart } from "lucide-react";

type DatasetBadge = "PREMIUM" | "NEW" | "TRENDING";

interface Dataset {
  id: string;
  name: string;
  meta: string;
  price: string;
  badge?: DatasetBadge;
  gradient: string;
}

const badgeStyles: Record<DatasetBadge, string> = {
  PREMIUM: "bg-atlas-cobalt text-white",
  NEW: "bg-emerald-600 text-white",
  TRENDING: "bg-amber-500 text-white",
};

const datasets: Dataset[] = [
  {
    id: "worldview-3",
    name: "WorldView-3 Imagery",
    meta: "30 cm Resolution · Maxar",
    price: "12.50",
    badge: "PREMIUM",
    gradient: "from-[#c9dcf1] to-[#e6eff9]",
  },
  {
    id: "global-dem",
    name: "Global DEM 30m",
    meta: "30 m Resolution · Airbus",
    price: "4.20",
    badge: "PREMIUM",
    gradient: "from-[#d9ecd6] to-[#eef7ec]",
  },
  {
    id: "sentinel-2",
    name: "Sentinel-2 L2A",
    meta: "10 m Resolution · ESA",
    price: "1.80",
    badge: "NEW",
    gradient: "from-[#f0e6d2] to-[#faf5ea]",
  },
  {
    id: "3d-buildings",
    name: "3D Buildings",
    meta: "Global Coverage · OSM",
    price: "6.00",
    gradient: "from-[#dbe1ea] to-[#f1f4f8]",
  },
  {
    id: "landsat-9",
    name: "Landsat 9 Collection 2",
    meta: "30 m Resolution · USGS",
    price: "1.20",
    badge: "TRENDING",
    gradient: "from-[#e4d7ea] to-[#f7f1f9]",
  },
];

export function RecommendedDatasets() {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold text-obsidian-graphite">Recommended Datasets</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Curated premium datasets for your projects
          </p>
        </div>
        <a
          href="/explore"
          className="text-sm font-medium text-atlas-cobalt transition-colors hover:text-[var(--color-cobalt-hover)]"
        >
          View all datasets &rarr;
        </a>
      </div>

      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {datasets.map((dataset) => (
          <a
            key={dataset.id}
            href={`/datasets/${dataset.id}`}
            className="w-52 shrink-0 overflow-hidden rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className={`relative aspect-[4/3] w-full bg-gradient-to-br ${dataset.gradient}`}>
              {dataset.badge && (
                <span
                  className={`absolute left-2.5 top-2.5 rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${badgeStyles[dataset.badge]}`}
                >
                  {dataset.badge}
                </span>
              )}
            </div>
            <div className="p-3.5">
              <h3 className="mb-1 truncate text-sm font-semibold text-obsidian-graphite">
                {dataset.name}
              </h3>
              <p className="mb-3 text-xs text-[var(--color-text-secondary)]">{dataset.meta}</p>
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  <span className="text-[var(--color-text-secondary)]">From </span>
                  <span className="font-bold text-obsidian-graphite">${dataset.price}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]"> /km&sup2;</span>
                </p>
                <span
                  role="button"
                  aria-label={`Add ${dataset.name} to cart`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-cobalt-soft)] text-atlas-cobalt transition-colors hover:bg-atlas-cobalt hover:text-white"
                >
                  <ShoppingCart className="h-4 w-4" />
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
