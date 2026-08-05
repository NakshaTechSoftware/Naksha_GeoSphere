import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Pauses/resumes when the browser tab is hidden or the element scrolls
 * out of the viewport, and resumes safely from the current point (never
 * restarts) — satisfies the perf requirement to stop off-screen work.
 */
export function useVisibilityPause(
  containerRef: RefObject<HTMLElement | null>,
  onPause: () => void,
  onResume: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) onPause();
      else onResume();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let observer: IntersectionObserver | undefined;
    const element = containerRef.current;
    if (element && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (document.hidden) return;
          if (entry.isIntersecting) onResume();
          else onPause();
        },
        { threshold: 0.15 },
      );
      observer.observe(element);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      observer?.disconnect();
    };
  }, [containerRef, onPause, onResume, enabled]);
}
