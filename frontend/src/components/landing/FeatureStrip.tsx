import { Globe, Square, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    id: "latest-data",
    icon: Globe,
    title: "Latest Geospatial Data",
    description: "Access the most current, high-resolution data from trusted global sources.",
  },
  {
    id: "flexible-selection",
    icon: Square,
    title: "Flexible Area Selection",
    description: "Draw, upload, or define your area of interest. Pay only for what you need.",
  },
  {
    id: "secure-delivery",
    icon: Shield,
    title: "Secure On-Demand Delivery",
    description: "Download securely in your preferred format with enterprise-grade protection.",
  },
];

export function FeatureStrip() {
  return (
    <section id="features" className="pt-16 pb-20 lg:pt-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                className="flex flex-col rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card transition-shadow hover:shadow-card-hover"
              >
                <div className="mb-4">
                  <Icon className="h-9 w-9 text-atlas-cobalt" strokeWidth={1.8} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-obsidian-graphite">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
