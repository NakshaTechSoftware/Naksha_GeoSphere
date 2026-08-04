"use client";

import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/layout/Footer";
import { SignInContent } from "./SignInContent";

export function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="geospatial-background flex-1">
        <SignInContent />
      </main>

      <Footer />
    </div>
  );
}
