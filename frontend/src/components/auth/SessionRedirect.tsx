"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { bootstrapSession, getSessionUser } from "@/lib/session";
import { isNativeApp } from "@/lib/native";

/**
 * Mobile-app-only resume: when a saved session exists (persisted natively so
 * it survives app restarts), skip the welcome page and go straight to /explore.
 *
 * Children are always rendered so the web landing page is completely
 * untouched (same SSR output as before); the redirect simply fires on mount
 * in the native app when a session is found.
 */
export function SessionRedirect({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isNativeApp()) return;
      // Load the durable session from native storage before deciding.
      await bootstrapSession();
      if (!cancelled && getSessionUser()) {
        router.replace("/explore");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <>{children}</>;
}
