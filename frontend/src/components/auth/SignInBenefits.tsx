"use client";

import { Database, ShoppingCart, Layers } from "lucide-react";

export function SignInBenefits() {
  return (
    <div className="flex flex-col justify-center">
      {/* Badge */}
      <div className="mb-6 inline-flex">
        <span className="inline-flex items-center rounded-full border border-atlas-cobalt/20 bg-atlas-cobalt/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-atlas-cobalt">
          Global Coverage. Premium Quality.
        </span>
      </div>

      {/* Heading */}
      <h1 className="mb-4 text-4xl font-bold leading-tight text-obsidian-graphite lg:text-5xl">
        Welcome back to your <br />
        <span className="text-atlas-cobalt">geospatial intelligence</span> hub.
      </h1>

      {/* Description */}
      <p className="mb-10 text-lg leading-relaxed text-gray-600">
        Securely access your purchased datasets, previews, downloads, and orders from trusted global
        sources.
      </p>

      {/* Benefits List */}
      <div className="space-y-6">
        {/* Benefit 1 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-atlas-cobalt/10">
            <Database className="h-6 w-6 text-atlas-cobalt" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-obsidian-graphite">
              Access saved datasets
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              View, preview, and re-download your purchased geospatial data anytime.
            </p>
          </div>
        </div>

        {/* Benefit 2 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-atlas-cobalt/10">
            <ShoppingCart className="h-6 w-6 text-atlas-cobalt" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-obsidian-graphite">
              Track orders & downloads
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Monitor order status, download history, and receipt details in one place.
            </p>
          </div>
        </div>

        {/* Benefit 3 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-atlas-cobalt/10">
            <Layers className="h-6 w-6 text-atlas-cobalt" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-obsidian-graphite">
              Continue your mapping workflow
            </h3>
            <p className="text-sm leading-relaxed text-gray-600">
              Pick up where you left off and seamlessly continue your spatial analysis.
            </p>
          </div>
        </div>
      </div>

      {/* Map Preview Image Placeholder */}
      <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
        <div className="relative aspect-[4/3] w-full">
          {/* This would be replaced with an actual map component or image */}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-atlas-cobalt/5 to-teal-primary/5">
            <div className="text-center">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md">
                <Layers className="h-8 w-8 text-atlas-cobalt" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-gray-600">
                Your geospatial workspace awaits
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
