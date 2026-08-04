import { FolderOpen, LayoutGrid } from "lucide-react";
import { DashboardMapPreview } from "@/components/home/DashboardMapPreview";

interface WelcomeHeroProps {
  firstName?: string;
}

export function WelcomeHero({ firstName = "Arjun" }: WelcomeHeroProps) {
  return (
    <section className="grid gap-10 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,1fr)] lg:items-center">
      <div>
        <span className="mb-4 inline-flex items-center rounded-full border border-atlas-cobalt/20 bg-[var(--color-cobalt-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-atlas-cobalt">
          Global Coverage. Premium Quality.
        </span>

        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-obsidian-graphite lg:text-5xl">
          Welcome back, <span className="text-atlas-cobalt">{firstName}!</span>
        </h1>

        <p className="mb-8 max-w-md text-base leading-relaxed text-[var(--color-text-secondary)]">
          Discover, preview, and purchase premium geospatial data from trusted global sources.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            href="/explore"
            className="inline-flex items-center gap-2 rounded-lg bg-atlas-cobalt px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Explore Datasets
          </a>
          <a
            href="/saved-aois"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-medium)] bg-white px-5 py-3 text-sm font-semibold text-obsidian-graphite transition-colors hover:bg-[var(--color-cobalt-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
          >
            <FolderOpen className="h-4 w-4" />
            View Saved AOIs
          </a>
        </div>
      </div>

      <DashboardMapPreview />
    </section>
  );
}
