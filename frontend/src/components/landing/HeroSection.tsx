import { HeroContent } from "./HeroContent";
import { HeroHeadline } from "./HeroHeadline";
import { GlobeWorkflowPreview } from "./GlobeWorkflowPreview";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Full-width 3D workflow cover, flush against the header. Hidden on mobile
          (common phone resolutions) - the 3D demo is desktop-only; phones get the
          badge + headline directly. */}
      <div className="relative hidden w-full px-0 md:block">
        <GlobeWorkflowPreview />
      </div>

      {/* Accent divider: turns the cover/background boundary into a deliberate design
          break instead of a bare edge where two different textures meet. Belongs entirely
          to the section below - doesn't sit on or alter the cover itself. */}
      <div
        className="h-1 w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--color-atlas-cobalt) 0%, #5b9bff 50%, var(--color-atlas-cobalt) 100%)",
        }}
      />

      {/* Badge straddles the cover/background boundary: negative margin pulls it up so
          its top half overlaps the cover and its bottom half sits on the page. */}
      <div className="relative z-10 mx-auto mt-6 max-w-content px-6 lg:pl-20 lg:pr-8 md:-mt-6">
        <span className="inline-flex items-center rounded-full border border-atlas-cobalt/20 bg-white px-5 py-3 text-sm font-semibold uppercase tracking-wide text-atlas-cobalt shadow-md">
          Global Coverage. Premium Quality.
        </span>
      </div>

      {/* Headline + description + CTAs sit on the page background, below the badge. */}
      <div className="relative mx-auto max-w-content px-6 pt-6 pb-10 lg:px-8 lg:pb-12">
        <HeroHeadline />
        <div className="mt-6">
          <HeroContent />
        </div>
      </div>
    </section>
  );
}
