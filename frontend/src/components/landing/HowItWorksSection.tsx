"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const AUTOPLAY_MS = 3200;

export function HowItWorksSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isPaused) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % steps.length);
    }, AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  const selectStep = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  return (
    <section id="how-it-works" className="py-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card lg:p-12">
          <h2 className="mb-10 text-center text-3xl font-bold text-obsidian-graphite">
            How It Works
          </h2>

          {/* Desktop: Horizontal 3D stepper */}
          <div
            className="hidden lg:block"
            style={{ perspective: "1600px" }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            <div className="relative flex items-start justify-between">
              {/* Connector segments - run only in the gaps BETWEEN step markers,
                  never through them. Each step is w-1/4 with an 80px sphere
                  centered, so the gap after column i spans from (i+0.5)*25%+44px
                  to (i+1.5)*25%-44px of the row width, at the markers' vertical
                  middle (badge 32px + mb-3 12px + half sphere 40px = 84px).
                  Gap i is filled once step i+1 is reached. */}
              {steps.slice(0, -1).map((_, i) => {
                const fill = Math.max(0, Math.min(1, activeIndex - i)) * 100;
                return (
                  <div
                    key={`connector-${i}`}
                    aria-hidden="true"
                    className="absolute top-[84px] h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--color-cobalt-medium)]"
                    style={{
                      left: `calc(${(i + 0.5) * 25}% + 44px)`,
                      right: `calc(${(2.5 - i) * 25}% + 44px)`,
                    }}
                  >
                    <div
                      className="h-full rounded-full bg-atlas-cobalt transition-[width] duration-700 ease-out"
                      style={{
                        width: `${fill}%`,
                        boxShadow: "0 0 10px 1px rgba(53, 99, 233, 0.6)",
                      }}
                    />
                  </div>
                );
              })}

              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === activeIndex;
                const offset = index - activeIndex;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => selectStep(index)}
                    onFocus={() => setIsPaused(true)}
                    onBlur={() => setIsPaused(false)}
                    aria-current={isActive}
                    className="relative z-10 flex w-1/4 flex-col items-center rounded-2xl text-center transition-transform duration-500 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
                    style={{
                      transformStyle: "preserve-3d",
                      // No translateY lift: the connector line runs through the
                      // vertical middle of every marker (84px), so the active step
                      // must keep its center on that line.
                      transform: isActive
                        ? "translateZ(30px) scale(1.06) rotateX(0deg)"
                        : `translateZ(0px) scale(0.96) rotateY(${offset > 0 ? -6 : 6}deg)`,
                      opacity: isActive ? 1 : 0.82,
                    }}
                  >
                    {/* Number badge */}
                    <div
                      className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition-all duration-500 ${
                        isActive ? "bg-atlas-cobalt shadow-[0_4px_14px_rgba(53,99,233,0.55)]" : "bg-atlas-cobalt/70"
                      }`}
                      style={{ transform: "translateZ(10px)" }}
                    >
                      {step.number}
                    </div>

                    {/* Icon sphere */}
                    <div
                      className="mb-4 flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500"
                      style={{
                        transform: isActive ? "translateZ(24px) rotateY(0deg)" : "translateZ(0px)",
                        background: isActive
                          ? "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), var(--color-cobalt-soft) 55%, var(--color-cobalt-medium) 100%)"
                          : "var(--color-cobalt-soft)",
                        boxShadow: isActive
                          ? "0 14px 28px -10px rgba(53,99,233,0.55), inset 0 1px 3px rgba(255,255,255,0.8)"
                          : "0 2px 6px rgba(21,26,35,0.06)",
                      }}
                    >
                      <Icon
                        className={`transition-all duration-500 ${isActive ? "h-10 w-10" : "h-9 w-9"} text-atlas-cobalt`}
                        strokeWidth={1.5}
                      />
                    </div>

                    {/* Content */}
                    <h3 className="mb-2 text-base font-semibold text-obsidian-graphite">
                      {step.title}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">{step.description}</p>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Mobile/Tablet: Vertical 3D stepper */}
          <div className="lg:hidden">
            <div className="relative">
              {/* Connector segments - run only in the vertical gaps BETWEEN step
                  rows, never through them. Each row's icon column is 104px tall
                  (badge 32px + mb-2 8px + sphere 64px) and rows are 24px apart,
                  so the gap after row i spans from 128i+104px to 128i+168px, at
                  the column's horizontal center (64px column -> 31px line). */}
              {steps.slice(0, -1).map((_, i) => {
                const fill = Math.max(0, Math.min(1, activeIndex - i)) * 100;
                return (
                  <div
                    key={`connector-${i}`}
                    aria-hidden="true"
                    className="absolute left-[31px] w-0.5 overflow-hidden rounded-full bg-[var(--color-cobalt-medium)]"
                    style={{ top: `${104 + 128 * i}px`, height: "64px" }}
                  >
                    <div
                      className="w-full rounded-full bg-atlas-cobalt transition-[height] duration-700 ease-out"
                      style={{
                        height: `${fill}%`,
                        boxShadow: "0 0 10px 1px rgba(53, 99, 233, 0.6)",
                      }}
                    />
                  </div>
                );
              })}

              <div className="space-y-6">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => selectStep(index)}
                      className="relative flex w-full gap-6 rounded-xl text-left transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt"
                    >
                      {/* Number and icon column */}
                      <div className="z-10 flex flex-col items-center">
                        <div
                          className={`mb-2 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition-all duration-300 ${
                            isActive ? "bg-atlas-cobalt shadow-[0_4px_12px_rgba(53,99,233,0.5)]" : "bg-atlas-cobalt/70"
                          }`}
                        >
                          {step.number}
                        </div>
                        <div
                          className="flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300"
                          style={{
                            background: isActive
                              ? "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9), var(--color-cobalt-soft) 55%, var(--color-cobalt-medium) 100%)"
                              : "var(--color-cobalt-soft)",
                            boxShadow: isActive
                              ? "0 10px 20px -8px rgba(53,99,233,0.5), inset 0 1px 2px rgba(255,255,255,0.8)"
                              : "0 1px 4px rgba(21,26,35,0.06)",
                          }}
                        >
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
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
