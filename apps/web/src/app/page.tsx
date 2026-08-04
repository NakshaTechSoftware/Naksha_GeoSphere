import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { MapPlaceholder } from "@/components/map/MapPlaceholder";
import { PlatformStatusGrid } from "@/components/PlatformStatusGrid";

const foundationPillars = [
  {
    title: "Modular monolith API",
    body: "A single FastAPI service organized into clear domain modules — catalog, AOI, pricing, orders, licensing — ready to split into services later without a rewrite.",
  },
  {
    title: "Geospatial-native storage",
    body: "PostgreSQL with PostGIS and pgcrypto enabled from the first migration, so spatial queries and secure identifiers are foundational, not bolted on.",
  },
  {
    title: "Dedicated processing workers",
    body: "Celery workers with queues reserved for raster, vector, LiDAR, and notification workloads — isolated from the request/response path.",
  },
  {
    title: "Private object storage",
    body: "S3-compatible buckets for source, preview, and order-output data, designed from day one for short-lived signed downloads instead of public URLs.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-spatial-navy text-cloud-mist">
          <div
            className="absolute inset-0 bg-geo-grid opacity-40 [background-size:32px_32px]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-transparent via-spatial-navy/40 to-spatial-navy"
            aria-hidden="true"
          />
          <Container className="relative py-24 lg:py-32">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <Badge tone="teal" className="mb-6">
                  Engineering Foundation · Phase 0
                </Badge>
                <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                  Naksha GeoSphere
                </h1>
                <p className="mt-3 text-lg font-medium text-cloud-mist/80">
                  The Geospatial Data Marketplace
                </p>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-cloud-mist/70">
                  Search a location, explore raster and vector datasets, preview them on an
                  interactive map, select an Area of Interest, and download exactly the data you
                  need — clipped, licensed, and ready to use. This build is the production-grade
                  foundation the full marketplace will be developed on.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Button variant="primary" disabled aria-disabled="true">
                    Explore Geospatial Data
                  </Button>
                  <a href="#platform-foundation">
                    <Button variant="ghost" className="border-cloud-mist/30 text-cloud-mist hover:bg-cloud-mist/10">
                      View Platform Foundation
                    </Button>
                  </a>
                </div>
                <p className="mt-4 text-xs text-cloud-mist/50">
                  Dataset search and purchasing are not enabled yet — the marketplace modules ship
                  in later phases.
                </p>
              </div>

              <MapPlaceholder />
            </div>
          </Container>
        </section>

        {/* Platform Foundation */}
        <section id="platform-foundation" className="py-20">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <Badge tone="navy" className="mb-4">
                Platform Foundation
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-spatial-navy">
                Built for a real geospatial marketplace, not a demo
              </h2>
              <p className="mt-4 text-base text-spatial-navy/70">
                Every layer below is live in local development and validated end-to-end — the
                same foundation future marketplace features will build on.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {foundationPillars.map((pillar) => (
                <Card key={pillar.title}>
                  <h3 className="text-base font-semibold text-spatial-navy">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-spatial-navy/70">{pillar.body}</p>
                </Card>
              ))}
            </div>
          </Container>
        </section>

        {/* Service status */}
        <section className="bg-white/50 py-20">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <Badge tone="teal" className="mb-4">
                Live Status
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight text-spatial-navy">
                Platform service health
              </h2>
              <p className="mt-4 text-base text-spatial-navy/70">
                Pulled live from{" "}
                <code className="rounded bg-spatial-navy/5 px-1.5 py-0.5 text-sm">
                  GET /api/v1/health
                </code>
                . This page keeps working even if the API is offline.
              </p>
            </div>

            <div className="mt-14">
              <PlatformStatusGrid />
            </div>
          </Container>
        </section>

        {/* Roadmap note */}
        <section className="py-16">
          <Container>
            <Card className="mx-auto max-w-3xl bg-spatial-navy text-center text-cloud-mist">
              <h3 className="text-lg font-semibold">The marketplace itself comes next</h3>
              <p className="mt-3 text-sm leading-relaxed text-cloud-mist/70">
                Authentication, the dataset catalog, AOI-based pricing, checkout, licensing, and
                secure downloads are intentionally not part of this foundation. This phase exists
                to make sure everything underneath — the API, database, workers, storage, and
                CI/CD — is solid before that logic is built.
              </p>
            </Card>
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
