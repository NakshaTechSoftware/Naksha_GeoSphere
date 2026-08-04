import { Award, Tag, Satellite, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TrustItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const trustItems: TrustItem[] = [
  {
    id: "quality",
    icon: Award,
    title: "Enterprise-grade quality",
    description: "Rigorous quality checks and industry standards you can rely on.",
  },
  {
    id: "pricing",
    icon: Tag,
    title: "Transparent pricing",
    description: "Clear, upfront pricing. No hidden fees or surprises.",
  },
  {
    id: "coverage",
    icon: Satellite,
    title: "Updated coverage",
    description: "Regularly updated data for accurate analysis and decision-making.",
  },
  {
    id: "security",
    icon: Lock,
    title: "Private & secure downloads",
    description: "Your data is protected with enterprise-grade security and privacy.",
  },
];

export function TrustStrip() {
  return (
    <section id="trust" className="relative overflow-hidden bg-obsidian-graphite py-20">
      {/* Subtle contour pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 60px,
              white 60px,
              white 61px
            ),
            repeating-linear-gradient(
              90deg,
              transparent,
              transparent 60px,
              white 60px,
              white 61px
            )
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-content px-6 lg:px-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item, index) => {
            const Icon = item.icon;
            const isLast = index === trustItems.length - 1;

            return (
              <div
                key={item.id}
                className={`flex flex-col items-center text-center ${
                  !isLast ? "lg:border-r lg:border-white/10" : ""
                } ${index < 2 ? "sm:border-r sm:border-white/10 lg:border-r" : ""} ${
                  index === 2 ? "sm:border-r-0" : ""
                }`}
              >
                <div className="bg-atlas-cobalt/10 mb-4 flex h-14 w-14 items-center justify-center rounded-xl">
                  <Icon className="h-7 w-7 text-atlas-cobalt" strokeWidth={1.5} />
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">{item.title}</h3>
                <p className="max-w-xs text-sm leading-relaxed text-white/70">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
