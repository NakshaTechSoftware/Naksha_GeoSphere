import { Globe, Square, Shield } from "lucide-react";

const benefits = [
  {
    icon: Globe,
    title: "Access global datasets",
    description: "High-resolution imagery, elevation, terrain, LiDAR and vector data from trusted providers.",
  },
  {
    icon: Square,
    title: "Select your area of interest",
    description: "Draw, upload, or define your AOI and preview data before you buy.",
  },
  {
    icon: Shield,
    title: "Secure downloads & orders",
    description: "Enterprise-grade security with reliable delivery and order tracking.",
  },
];

export function SignupBenefits() {
  return (
    <div className="flex flex-col justify-center">
      {/* Badge */}
      <div className="mb-6">
        <span className="inline-flex items-center rounded-full border border-atlas-cobalt/20 bg-[var(--color-cobalt-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-atlas-cobalt">
          Global Coverage. Premium Quality.
        </span>
      </div>

      {/* Heading */}
      <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-obsidian-graphite lg:text-5xl">
        Create your account
        <br />
        and unlock premium
        <br />
        geospatial <span className="text-atlas-cobalt">intelligence.</span>
      </h1>

      {/* Description */}
      <p className="mb-10 text-base leading-relaxed text-[var(--color-text-secondary)]">
        Discover, preview, select, purchase, and securely download high-quality geospatial data
        from trusted global sources.
      </p>

      {/* Benefits List */}
      <div className="space-y-6">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div key={benefit.title} className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-cobalt-soft)]">
                <Icon className="h-6 w-6 text-atlas-cobalt" strokeWidth={1.8} />
              </div>
              <div>
                <h3 className="mb-1 text-base font-semibold text-obsidian-graphite">
                  {benefit.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {benefit.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Map Preview Image Placeholder */}
      <div className="mt-10 overflow-hidden rounded-xl border border-[var(--color-border-medium)] bg-white shadow-md">
        <div className="relative aspect-video w-full bg-gradient-to-br from-[#c8ddf4] to-[#e1edf9]">
          {/* Simplified map visualization */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs font-medium text-obsidian-graphite/60">Selected Data</p>
              <div className="mt-2 flex gap-2">
                <span className="rounded-full bg-atlas-cobalt px-3 py-1 text-xs font-medium text-white">
                  Imagery
                </span>
                <span className="rounded-full bg-atlas-cobalt px-3 py-1 text-xs font-medium text-white">
                  Elevation
                </span>
              </div>
              <div className="mt-4 text-sm font-semibold text-obsidian-graphite">12.45 km²</div>
              <div className="text-xs text-obsidian-graphite/60">39 cm / 1 m</div>
              <div className="mt-3 text-lg font-bold text-obsidian-graphite">$1,245.00 USD</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
