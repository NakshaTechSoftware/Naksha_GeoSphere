"use client";

import { LandingHeader } from "@/components/landing/LandingHeader";
import { SignInContent } from "./SignInContent";
import { SignInMapBackground } from "./SignInMapBackground";

export function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="relative flex flex-1 flex-col justify-center">
        <SignInMapBackground />
        <SignInContent />
      </main>
    </div>
  );
}
