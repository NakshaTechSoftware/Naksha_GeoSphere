"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

/**
 * Mobile-app-only build freshness check. The web header fix (no-store on HTML)
 * stops the WebView caching pages going forward, but a page cached BEFORE that
 * fix can still be served once - so on every app open we ask the server for the
 * current build stamp and, if it differs from the last one we saw, reload once.
 * The reload picks up the new HTML + chunks; the freshly stored stamp prevents
 * any loop. Desktop browsers are untouched.
 */
export function AppVersionCheck() {
  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (!data.version) return;
        const KEY = "naksha.appBuildVersion";
        const previous = localStorage.getItem(KEY);
        if (previous !== null && previous !== data.version) {
          localStorage.setItem(KEY, data.version);
          if (!cancelled) window.location.reload();
        } else {
          localStorage.setItem(KEY, data.version);
        }
      } catch {
        // Offline / version endpoint unreachable - keep using the current page.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
