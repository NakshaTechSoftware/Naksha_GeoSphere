"use client";

import { useEffect, useRef, useState } from "react";
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

/** Mobile-only staggered slide-in for the feature cards: card 1 slides from the
 *  left, card 2 from the right, card 3 from the left, each after the previous
 *  one settles. Replays every time the section scrolls into view. Desktop
 *  (>= 768px) renders the plain static grid, untouched. */
export function FeatureStrip() {
  const sectionRef = useRef<HTMLElement>(null);
  // entered = section in view (cards hidden until then); animate = the
  // slide-in has started. Hidden cards stay at translateX(0) so their
  // invisible state never stretches the document past the viewport (which
  // made a left swipe pan the whole page). The +/- offset is applied for one
  // frame at the animation start, then transitions to 0.
  const [entered, setEntered] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (window.innerWidth >= 768) {
      setEntered(true);
      setAnimate(true);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;
    let raf: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setEntered(true);
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => setAnimate(true));
          } else {
            setEntered(false);
            setAnimate(false);
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section id="features" ref={sectionRef} className="pt-16 pb-20 lg:pt-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            // Alternate the slide-in direction per card: left, right, left, ...
            const fromLeft = index % 2 === 0;
            // With 3 cards in a 2-column grid (tablet / narrow widths) the last
            // card would sit bottom-left leaving an empty right slot - let it
            // span both columns so the layout stays balanced.
            const spanFull = index === features.length - 1;
            return (
              <div
                key={feature.id}
                className={`flex flex-col rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card transition-shadow hover:shadow-card-hover max-md:will-change-transform ${
                  spanFull ? "sm:col-span-2 lg:col-span-1" : ""
                }`}
                style={{
                  opacity: entered ? 1 : 0,
                  transform:
                    entered && !animate
                      ? `translateX(${fromLeft ? "-3.5rem" : "3.5rem"})`
                      : "translateX(0)",
                  transition: animate
                    ? `transform 0.5s ease-out ${index * 0.28}s, opacity 0.5s ease-out ${index * 0.28}s`
                    : "none",
                }}
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
