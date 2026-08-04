"use client";

import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/layout/Footer";
import { SignupForm } from "./SignupForm";
import { SignupBenefits } from "./SignupBenefits";

export function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="geospatial-background flex-1">
        <div className="relative mx-auto max-w-content px-6 py-16 lg:px-16 lg:py-20">
          <div className="grid gap-16 lg:grid-cols-[45%_55%] lg:items-start">
            {/* Left: Benefits */}
            <SignupBenefits />

            {/* Right: Form */}
            <SignupForm />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
