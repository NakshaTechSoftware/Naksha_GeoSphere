import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function HeroContent() {
  return (
    <div className="flex flex-col justify-center">
      {/* Description */}
      <p className="mb-4 max-w-[560px] text-base leading-relaxed text-white md:mx-auto md:text-center [text-shadow:0_1px_2px_rgba(0,0,0,0.9),0_2px_6px_rgba(0,0,0,0.7),0_0_14px_rgba(0,0,0,0.5)]">
        Access premium geospatial data for imagery, elevation, terrain, LiDAR, vector layers, and
        more. Global coverage. Trusted quality. Delivered securely.
      </p>

      {/* CTAs */}
      <div className="flex flex-wrap gap-4 md:justify-center">
        <a href="/welcome-page#data-formats">
          <Button
            variant="headerCta"
            className="h-12 px-6 shadow-button"
          >
            Explore Geospatial Data
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </a>
        <a href="/welcome-page#how-it-works">
          <Button
            variant="ghost"
            className="!border-atlas-cobalt/30 h-12 !bg-white px-6 !text-atlas-cobalt hover:!bg-[#eef2fe]"
          >
            <Play className="mr-2 h-4 w-4 fill-current" />
            View How It Works
          </Button>
        </a>
      </div>
    </div>
  );
}
