"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

interface DataFormat {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  cta: string;
  image: string;
}

const dataFormats: DataFormat[] = [
  {
    id: "kml-kmz",
    name: "KML / KMZ",
    subtitle: "Google Earth Formats",
    description:
      "Boundary and point data in Google Earth's native format, ready to visualize instantly.",
    cta: "Explore KML / KMZ",
    image: "/assets/kml-preview.svg",
  },
  {
    id: "geotiff",
    name: "GeoTIFF",
    subtitle: "Georeferenced Rasters",
    description:
      "Access current high-resolution aerial imagery for your selected area.",
    cta: "Explore Imagery",
    image: "/assets/orthophoto-preview.svg",
  },
  {
    id: "geojson",
    name: "GeoJSON",
    subtitle: "Vector Data Format",
    description:
      "Lightweight vector features — points, lines and polygons — ready for analysis.",
    cta: "Explore Vector Data",
    image: "/assets/geojson-preview.svg",
  },
  {
    id: "shapefile",
    name: "Shapefile",
    subtitle: "ESRI Vector Format",
    description:
      "The classic ESRI vector format for boundaries and administrative layers.",
    cta: "View Dataset",
    image: "/assets/shapefile-preview.svg",
  },
  {
    id: "dem-dsm-dtm",
    name: "DEM / DSM / DTM",
    subtitle: "Elevation Models & Terrain",
    description:
      "Terrain and elevation models for slopes, viewsheds and contour generation.",
    cta: "Explore Elevation",
    image: "/assets/elevation-preview.svg",
  },
  {
    id: "las-laz",
    name: "LAS / LAZ",
    subtitle: "LiDAR Point Clouds",
    description:
      "Dense LiDAR point clouds for precise 3D terrain, structures and vegetation.",
    cta: "Explore LiDAR",
    image: "/assets/las-preview.svg",
  },
];

const CARD_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function AccordionRow({ formats }: { formats: DataFormat[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div
      className="flex h-[380px] gap-2.5"
      onMouseLeave={() => setActiveIndex(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setActiveIndex(null);
        }
      }}
    >
      {formats.map((format, index) => {
        const active = activeIndex === index;

        return (
          <div
            key={format.id}
            role="button"
            tabIndex={0}
            aria-expanded={active}
            aria-label={`${format.name} — ${format.subtitle}`}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(active ? null : index)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveIndex(active ? null : index);
              }
            }}
            className={`group relative min-w-0 overflow-hidden rounded-2xl border transition-[flex-grow] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus:outline-none motion-reduce:transition-none ${
              active
                ? "border-atlas-cobalt/40 shadow-card-hover"
                : "border-[var(--color-border-subtle)]"
            } focus-visible:outline-2 focus-visible:outline-atlas-cobalt focus-visible:outline-offset-3`}
            style={{ flexGrow: active ? 2 : 1, flexBasis: 0 }}
          >
            {/* Preview image fills the card; subtle zoom while active */}
            <img
              src={format.image}
              alt={`${format.name} preview`}
              className={`absolute inset-0 h-full w-full object-cover transition-transform duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                active ? "scale-[1.03]" : "scale-100"
              }`}
            />

            {/* Two crossfading scrims so text stays readable over the imagery */}
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                active ? "opacity-0" : "opacity-100"
              }`}
              style={{
                background:
                  "linear-gradient(180deg, rgba(21,26,35,0.06) 10%, rgba(21,26,35,0.20) 60%, rgba(21,26,35,0.48) 100%)",
              }}
            />
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                active ? "opacity-100" : "opacity-0"
              }`}
              style={{
                background:
                  "linear-gradient(180deg, rgba(21,26,35,0.08) 5%, rgba(21,26,35,0.30) 52%, rgba(21,26,35,0.78) 100%)",
              }}
            />

            {/* Content stack: title → subtitle → description → CTA */}
            <div className="relative z-10 flex min-w-0 flex-col justify-end p-6">
              <h3
                className={`mb-1 text-white transition-all duration-300 motion-reduce:transition-none ${
                  active ? "text-2xl" : "text-xl"
                } font-semibold`}
              >
                {format.name}
              </h3>
              <p className="text-sm text-white/85">{format.subtitle}</p>

              <p
                className={`mt-3 max-w-xs text-sm leading-relaxed text-white/90 transition-all duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                  active
                    ? "visible translate-y-0 opacity-100 delay-[140ms]"
                    : "invisible translate-y-3 opacity-0 delay-0"
                }`}
              >
                {format.description}
              </p>

              <span
                className={`mt-4 inline-flex items-center gap-1.5 self-start rounded-lg bg-atlas-cobalt px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--color-cobalt-hover)] motion-reduce:transition-none ${
                  active
                    ? "visible translate-y-0 opacity-100 delay-[240ms]"
                    : "invisible translate-y-2.5 opacity-0 delay-0"
                }`}
              >
                {format.cta}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const VISIBLE_CARDS = 3;
const CARD_HEIGHT = 160;
const CARD_GAP = 16;

/** Mobile-only looping vertical carousel: exactly three format cards are
 *  visible, and they cycle upward (2nd covers the 1st, 3rd takes the 2nd
 *  slot, 4th enters at the 3rd, ...) in a seamless loop. Desktop (>= 1024px)
 *  keeps the horizontal accordion rows, untouched. */
function MobileFormatCarousel({ formats }: { formats: DataFormat[] }) {
  // Duplicate the first VISIBLE_CARDS entries at the end so the track can
  // loop seamlessly: when the translate reaches the tail, it snaps back to
  // the head with no visible jump.
  const items = [...formats, ...formats.slice(0, VISIBLE_CARDS)];
  const step = CARD_HEIGHT + CARD_GAP;
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setAnimating(true);
      setIndex((prev) => prev + 1);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  const handleTransitionEnd = () => {
    // Reached the duplicate tail - snap back to the head without animating.
    if (index >= formats.length) {
      setAnimating(false);
      setIndex(0);
    }
  };

  return (
    <div
      className="overflow-hidden lg:hidden"
      style={{ height: VISIBLE_CARDS * CARD_HEIGHT + (VISIBLE_CARDS - 1) * CARD_GAP }}
    >
      <div
        className="flex flex-col"
        style={{
          gap: CARD_GAP,
          transform: `translateY(-${index * step}px)`,
          transition: animating ? "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {items.map((format, i) => (
          <div
            key={`${format.id}-${i}`}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--color-border-subtle)] transition-all hover:border-atlas-cobalt/30 hover:shadow-card-hover"
            style={{ height: CARD_HEIGHT }}
          >
            <img
              src={format.image}
              alt={`${format.name} preview`}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <div className="relative z-10 mt-auto flex flex-col items-center p-5 text-center">
              <h3 className="mb-1 text-base font-semibold text-white">{format.name}</h3>
              <p className="text-sm text-white/85">{format.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataFormatsSection() {
  return (
    <section id="data-formats" className="pt-16 pb-10 lg:mt-32 lg:py-20">
      <div className="mx-auto max-w-content px-6 lg:px-16">
        <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 pb-16 shadow-card lg:p-12">
          <h2 className="mb-10 text-center text-3xl font-bold text-obsidian-graphite">
            Data Formats & Products
          </h2>

          {/* Desktop / large screens: horizontal accordion rows */}
          <div className="hidden flex-col gap-6 lg:flex">
            <AccordionRow formats={dataFormats.slice(0, 3)} />
            <AccordionRow formats={dataFormats.slice(3, 6)} />
          </div>

          {/* Tablet / mobile: looping carousel, three cards visible */}
          <MobileFormatCarousel formats={dataFormats} />
        </div>
      </div>
    </section>
  );
}
