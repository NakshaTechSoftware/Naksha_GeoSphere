import { Search, Map, Square, Download } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface WorkflowStep {
  id: string;
  number: number;
  icon: LucideIcon;
  title: string;
  description: string;
}

const steps: WorkflowStep[] = [
  {
    id: "search",
    number: 1,
    icon: Search,
    title: "Search Location",
    description: "Find any place on the map.",
  },
  {
    id: "preview",
    number: 2,
    icon: Map,
    title: "Preview Data",
    description: "Explore available layers and data previews.",
  },
  {
    id: "select",
    number: 3,
    icon: Square,
    title: "Select AOI & Pay",
    description: "Define your area, choose data, and pay.",
  },
  {
    id: "download",
    number: 4,
    icon: Download,
    title: "Download Securely",
    description: "Receive your data quickly and securely.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-polar-pearl py-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card lg:p-12">
          <h2 className="mb-10 text-center text-3xl font-bold text-obsidian-graphite">
            How It Works
          </h2>

          {/* Desktop: Horizontal */}
          <div className="hidden lg:block">
            <div className="relative flex items-start justify-between">
              {/* Connector line */}
              <div
                className="absolute left-0 right-0 top-12 h-0.5 bg-gradient-to-r from-[var(--color-cobalt-medium)] via-[var(--color-cobalt-medium)] to-[var(--color-cobalt-medium)]"
                style={{
                  width: "calc(100% - 8rem)",
                  marginLeft: "4rem",
                }}
                aria-hidden="true"
              />

              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.id}
                    className="relative z-10 flex w-1/4 flex-col items-center text-center"
                  >
                    {/* Number badge */}
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-atlas-cobalt text-sm font-bold text-white">
                      {step.number}
                    </div>

                    {/* Icon */}
                    <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)]">
                      <Icon className="h-9 w-9 text-atlas-cobalt" strokeWidth={1.5} />
                    </div>

                    {/* Content */}
                    <h3 className="mb-2 text-base font-semibold text-obsidian-graphite">
                      {step.title}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile/Tablet: Vertical */}
          <div className="lg:hidden">
            <div className="relative space-y-6">
              {/* Connector line */}
              <div
                className="absolute bottom-8 left-4 top-8 w-0.5 bg-[var(--color-cobalt-medium)]"
                aria-hidden="true"
              />

              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className="relative flex gap-6">
                    {/* Number and icon column */}
                    <div className="z-10 flex flex-col items-center">
                      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-atlas-cobalt text-sm font-bold text-white">
                        {step.number}
                      </div>
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)]">
                        <Icon className="h-7 w-7 text-atlas-cobalt" strokeWidth={1.5} />
                      </div>
                    </div>

                    {/* Content column */}
                    <div className="flex-1 pt-1">
                      <h3 className="mb-1 text-base font-semibold text-obsidian-graphite">
                        {step.title}
                      </h3>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
