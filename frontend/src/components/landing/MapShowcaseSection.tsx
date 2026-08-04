"use client";

import { InteractiveMap } from "@/components/map/InteractiveMap";

/**
 * Map showcase section displaying interactive geospatial visualization
 * of India with sample datasets for the landing page.
 */
export function MapShowcaseSection() {
  return (
    <section className="container-width py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-cloud-mist md:text-4xl">
            Visualize Geospatial Data
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-cloud-mist/80">
            Explore India's geographic information through interactive maps.
            Discover datasets, analyze spatial patterns, and unlock insights.
          </p>
        </div>

        {/* Interactive map */}
        <div className="relative">
          {/* Glow effect behind map */}
          <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 blur-2xl"></div>

          {/* Map container */}
          <div className="relative aspect-video">
            <InteractiveMap showDatasets={true} interactive={true} />
          </div>
        </div>

        {/* Feature highlights below map */}
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-cloud-mist/10 bg-spatial-navy/50 p-6 backdrop-blur-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <svg
                className="h-5 w-5 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </div>
            <h3 className="mb-2 font-semibold text-cloud-mist">
              Interactive Exploration
            </h3>
            <p className="text-sm text-cloud-mist/70">
              Pan, zoom, and click on data points to explore detailed
              information about locations and datasets.
            </p>
          </div>

          <div className="rounded-lg border border-cloud-mist/10 bg-spatial-navy/50 p-6 backdrop-blur-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
              <svg
                className="h-5 w-5 text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <h3 className="mb-2 font-semibold text-cloud-mist">
              Multiple Layers
            </h3>
            <p className="text-sm text-cloud-mist/70">
              Visualize different dataset categories with color-coded markers
              and customizable layer controls.
            </p>
          </div>

          <div className="rounded-lg border border-cloud-mist/10 bg-spatial-navy/50 p-6 backdrop-blur-sm">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10">
              <svg
                className="h-5 w-5 text-pink-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="mb-2 font-semibold text-cloud-mist">
              Real-time Updates
            </h3>
            <p className="text-sm text-cloud-mist/70">
              Access live geospatial data streams and see updates reflected
              instantly on the map visualization.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
