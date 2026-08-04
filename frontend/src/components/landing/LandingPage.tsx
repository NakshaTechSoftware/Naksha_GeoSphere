import { LandingHeader } from "./LandingHeader";
import { HeroSection } from "./HeroSection";
import { FeatureStrip } from "./FeatureStrip";
import { DataFormatsSection } from "./DataFormatsSection";
import { HowItWorksSection } from "./HowItWorksSection";
import { TrustStrip } from "./TrustStrip";
import { Footer } from "@/components/layout/Footer";

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="geospatial-background flex-1">
        <HeroSection />
        <FeatureStrip />
        <DataFormatsSection />
        <HowItWorksSection />
        <TrustStrip />
      </main>

      <Footer />
    </div>
  );
}
