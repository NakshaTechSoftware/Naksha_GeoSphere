import { Download } from "lucide-react";

interface DownloadItem {
  id: string;
  name: string;
  meta: string;
  date: string;
  gradient: string;
}

const downloads: DownloadItem[] = [
  {
    id: "downtown-imagery",
    name: "Downtown District Imagery",
    meta: "30 cm · Maxar",
    date: "May 12, 2024",
    gradient: "from-[#c9dcf1] to-[#e6eff9]",
  },
  {
    id: "city-elevation",
    name: "City Elevation Model",
    meta: "1 m · Airbus",
    date: "May 10, 2024",
    gradient: "from-[#d9ecd6] to-[#eef7ec]",
  },
  {
    id: "coastal-ortho",
    name: "Coastal Region Orthomosaic",
    meta: "15 cm · Vexcel",
    date: "May 8, 2024",
    gradient: "from-[#e4d7ea] to-[#f7f1f9]",
  },
];

export function RecentDownloads() {
  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-obsidian-graphite">Recent Downloads</h2>
        <a
          href="/downloads"
          className="text-sm font-medium text-atlas-cobalt transition-colors hover:text-[var(--color-cobalt-hover)]"
        >
          View all
        </a>
      </div>

      <ul className="space-y-3">
        {downloads.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <div
              className={`h-11 w-11 shrink-0 rounded-lg bg-gradient-to-br ${item.gradient}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-obsidian-graphite">{item.name}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {item.meta} &middot; {item.date}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Completed
            </span>
            <a
              href={`/downloads/${item.id}`}
              aria-label={`Download ${item.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-cobalt-soft)] hover:text-atlas-cobalt"
            >
              <Download className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
