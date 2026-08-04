import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function HeroContent() {
  return (
    <div className="flex flex-col justify-center">
      {/* Badge */}
      <div className="mb-6">
        <span className="border-atlas-cobalt/20 inline-flex items-center rounded-full border bg-[var(--color-cobalt-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-atlas-cobalt">
          Global Coverage. Premium Quality.
        </span>
      </div>

      {/* Headline */}
      <h1 className="hero-title mb-6 font-bold tracking-tight text-obsidian-graphite">
        <span className="hero-title-line">
          Explore
          <span className="hero-title-dot" aria-hidden="true">
            .
          </span>
          <span aria-hidden="true"> </span>
          Select
          <span className="hero-title-dot" aria-hidden="true">
            .
          </span>
        </span>
        <span className="hero-title-line">
          Purchase
          <span className="hero-title-dot" aria-hidden="true">
            .
          </span>
          <span aria-hidden="true"> </span>
          Download
          <span className="hero-title-dot" aria-hidden="true">
            .
          </span>
        </span>
      </h1>

      {/* Description */}
      <p className="mb-8 max-w-[560px] text-base leading-relaxed text-[var(--color-text-secondary)]">
        Access premium geospatial data for imagery, elevation, terrain, LiDAR, vector layers, and
        more. Global coverage. Trusted quality. Delivered securely.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-4">
        <a href="/welcome-page#data-formats">
          <Button className="h-12 bg-atlas-cobalt px-6 text-white shadow-button hover:bg-[var(--color-cobalt-hover)] active:bg-[#294DB8] focus-visible:ring-atlas-cobalt/30">
            Explore Geospatial Data
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </a>
        <a href="/welcome-page#how-it-works">
          <Button
            variant="ghost"
            className="border-atlas-cobalt/30 h-12 bg-white px-6 text-atlas-cobalt hover:bg-[var(--color-cobalt-soft)]"
          >
            <Play className="mr-2 h-4 w-4 fill-current" />
            View How It Works
          </Button>
        </a>
      </div>
    </div>
  );
}
