"use client";

import { Database, ShoppingCart, Layers } from "lucide-react";

export function SignInBenefits() {
  return (
    <div className="flex flex-col justify-center">
      {/* Heading */}
      <h1 className="mb-4 text-4xl font-bold leading-tight text-white lg:text-5xl">
        Welcome back to your <br />
        <span className="text-sky-300">geospatial intelligence</span> hub.
      </h1>

      {/* Description */}
      <p className="mb-10 text-lg leading-relaxed text-white/80">
        Securely access your purchased datasets, previews, downloads, and orders from trusted global
        sources.
      </p>

      {/* Benefits List */}
      <div className="space-y-6">
        {/* Benefit 1 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Database className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-white">
              Access saved datasets
            </h3>
            <p className="text-sm leading-relaxed text-white/75">
              View, preview, and re-download your purchased geospatial data anytime.
            </p>
          </div>
        </div>

        {/* Benefit 2 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
            <ShoppingCart className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-white">
              Track orders & downloads
            </h3>
            <p className="text-sm leading-relaxed text-white/75">
              Monitor order status, download history, and receipt details in one place.
            </p>
          </div>
        </div>

        {/* Benefit 3 */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Layers className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-white">
              Continue your mapping workflow
            </h3>
            <p className="text-sm leading-relaxed text-white/75">
              Pick up where you left off and seamlessly continue your spatial analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
