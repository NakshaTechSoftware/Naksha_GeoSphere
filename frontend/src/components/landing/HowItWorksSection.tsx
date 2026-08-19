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
  const [stepOneInView, setStepOneInView] = useState(false);
  const [mobileWidth, setMobileWidth] = useState(0);
  const mobileRef = useRef<HTMLDivElement | null>(null);
  const mobileWrapRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Measure the mobile stepper width so the curved connectors between the
  // alternating icon sides (step 1 icon left, step 2 icon right) can be drawn
  // with exact coordinates.
  useEffect(() => {
    const el = mobileWrapRef.current;
    if (!el) return;
    const update = () => setMobileWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mobile-only sequential reveal for step 1: when the stepper scrolls into
  // view, the icon fades in first, then (once fully visible) the text fades in
  // on the same row. Resets when it scrolls out of view so it replays.
  useEffect(() => {
    const el = mobileRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => setStepOneInView(e.isIntersecting));
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

          {/* Mobile/Tablet: Vertical stepper, alternating icon sides */}
          <div ref={mobileRef} className="lg:hidden">
            <div ref={mobileWrapRef} className="relative">
              {/* Curved connectors. Icons alternate sides: step 1 left, step 2
                  right, step 3 left, step 4 right. Each connector runs down the
                  icon gutter (x = 32 on the left, W-32 on the right, hidden
                  behind the spheres), crosses horizontally through the EMPTY
                  gap between rows (gap centers y = 120, 268, 416), and never
                  passes over any step's text. Sphere centers: row i's icon
                  column is 104px tall (badge 32 + mb-2 8 + sphere 64) with rows
                  32px apart, so row i's sphere center is (32 or W-32, 136i+72). */}
              {mobileWidth > 0 && (
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-0"
                  width="100%"
                  height="540"
                  viewBox={`0 0 ${mobileWidth} 540`}
                  preserveAspectRatio="none"
                  fill="none"
                >
                  {/* Step 1 (left) -> step 2 (right) */}
                  <path
                    d={`M 32 72 L 32 112 Q 32 120 60 120 L ${mobileWidth - 60} 120 Q ${mobileWidth - 32} 120 ${mobileWidth - 32} 112 L ${mobileWidth - 32} 208`}
                    stroke="var(--color-cobalt-medium)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Step 2 (right) -> step 3 (left) */}
                  <path
                    d={`M ${mobileWidth - 32} 208 L ${mobileWidth - 32} 260 Q ${mobileWidth - 32} 268 ${mobileWidth - 60} 268 L 60 268 Q 32 268 32 260 L 32 356`}
                    stroke="var(--color-cobalt-medium)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Step 3 (left) -> step 4 (right) */}
                  <path
                    d={`M 32 356 L 32 408 Q 32 416 60 416 L ${mobileWidth - 60} 416 Q ${mobileWidth - 32} 416 ${mobileWidth - 32} 408 L ${mobileWidth - 32} 504`}
                    stroke="var(--color-cobalt-medium)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}

              <div className="space-y-8">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const isActive = index === activeIndex;
                  const isFirst = index === 0;
                  const mirrored = index === 1 || index === 3;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => selectStep(index)}
                      className={`relative flex w-full items-stretch gap-6 rounded-xl text-left transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt ${
                        mirrored ? "flex-row-reverse" : ""
                      }`}
                    >
                      {/* Number and icon column: step 1 fades in first */}
                      <div
                        className={`z-10 flex flex-col items-center transition-all duration-700 ease-out motion-reduce:transition-none ${
                          isFirst && !stepOneInView
                            ? "scale-90 opacity-0"
                            : "scale-100 opacity-100"
                        }`}
                      >
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

                      {/* Content column: vertically centered against the icon
                          sphere; step 2's text sits on the left, right-aligned
                          toward its icon */}
                      <div
                        className={`flex-1 pt-12 transition-all duration-500 ease-out motion-reduce:transition-none ${mirrored ? "text-right" : ""}`}
                      >
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
