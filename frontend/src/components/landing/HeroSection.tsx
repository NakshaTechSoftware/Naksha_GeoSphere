import { HeroContent } from "./HeroContent";
import { GlobeWorkflowPreview } from "./GlobeWorkflowPreview";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto max-w-content px-6 pt-16 pb-6 lg:px-16 lg:pt-20 lg:pb-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(580px,1fr)_minmax(620px,1.3fr)] lg:gap-20">
          {/* Left: Hero Content */}
          <HeroContent />

          {/* Right: 3D Workflow Preview */}
          <GlobeWorkflowPreview />
        </div>
      </div>
    </section>
  );
}
