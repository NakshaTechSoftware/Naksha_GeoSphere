import { MoreVertical } from "lucide-react";

interface SavedAoi {
  id: string;
  name: string;
  area: string;
  date: string;
  gradient: string;
}

const savedAois: SavedAoi[] = [
  {
    id: "project-alpha",
    name: "Project Alpha – Site A",
    area: "12.45 km²",
    date: "May 12, 2024",
    gradient: "from-[#c9dcf1] to-[#e6eff9]",
  },
  {
    id: "urban-expansion",
    name: "Urban Expansion Study",
    area: "85.30 km²",
    date: "May 9, 2024",
    gradient: "from-[#d9ecd6] to-[#eef7ec]",
  },
  {
    id: "coastal-monitoring",
    name: "Coastal Monitoring Zone",
    area: "43.18 km²",
    date: "May 6, 2024",
    gradient: "from-[#e4d7ea] to-[#f7f1f9]",
  },
];

export function SavedAOIs() {
  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-obsidian-graphite">Saved Areas of Interest</h2>
        <a
          href="/saved-aois"
          className="text-sm font-medium text-atlas-cobalt transition-colors hover:text-[var(--color-cobalt-hover)]"
        >
          View all
        </a>
      </div>

      <ul className="space-y-3">
        {savedAois.map((aoi) => (
          <li key={aoi.id} className="flex items-center gap-3">
            <div
              className={`h-11 w-11 shrink-0 rounded-lg bg-gradient-to-br ${aoi.gradient}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-obsidian-graphite">{aoi.name}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {aoi.area} &middot; Created {aoi.date}
              </p>
            </div>
            <button
              type="button"
              aria-label={`More actions for ${aoi.name}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-cobalt-soft)] hover:text-atlas-cobalt"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
