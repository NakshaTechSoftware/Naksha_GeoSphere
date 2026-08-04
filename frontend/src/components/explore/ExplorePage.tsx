"use client";

import { DashboardHeader } from "@/components/home/DashboardHeader";
import { Footer } from "@/components/layout/Footer";
import { IndiaMapViewer } from "./IndiaMapViewer";

export function ExplorePage() {
  return (
    <div className="flex min-h-screen flex-col bg-polar-pearl">
      <DashboardHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-content px-6 py-10 lg:px-16 lg:py-12">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-bold text-obsidian-graphite">
              Explore Datasets
            </h1>
            <p className="text-base text-gray-600">
              Browse and discover premium geospatial data from trusted global sources.
            </p>
          </div>

          {/* India Map Viewer */}
          <IndiaMapViewer />
        </div>
      </main>

      <Footer />
    </div>
  );
}
