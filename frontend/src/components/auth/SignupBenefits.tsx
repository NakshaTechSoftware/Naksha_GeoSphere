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
      {/* Heading */}
      <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-white lg:text-5xl">
        Create your account
        <br />
        and unlock premium
        <br />
        geospatial <span className="text-sky-300">intelligence.</span>
      </h1>

      {/* Description */}
      <p className="mb-10 text-base leading-relaxed text-white/80">
        Discover, preview, select, purchase, and securely download high-quality geospatial data
        from trusted global sources.
      </p>

      {/* Benefits List */}
      <div className="space-y-6">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div key={benefit.title} className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon className="h-6 w-6 text-white" strokeWidth={1.8} />
              </div>
              <div>
                <h3 className="mb-1 text-base font-semibold text-white">
                  {benefit.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/75">
                  {benefit.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
