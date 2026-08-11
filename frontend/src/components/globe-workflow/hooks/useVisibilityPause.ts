import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Pauses a GSAP timeline when the document is hidden (tab switch) or when the component
 * leaves the viewport, and resumes gracefully when visible again. Respects an explicit
 * user pause (does not force-resume a paused timeline).
 */
export function useVisibilityPause(
  timeline: gsap.core.Timeline | null,
  isPlaying: boolean,
  containerRef?: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!timeline) return;

    const container = containerRef?.current ?? undefined;
    const userPausedRef = { paused: false };
    (timeline as unknown as { __userPaused?: { paused: boolean } }).__userPaused =
      userPausedRef;

    const handleVisibility = () => {
      if (document.hidden) {
        if (!timeline.paused()) {
          userPausedRef.paused = true;
          timeline.pause();
        }
      } else if (userPausedRef.paused && isPlaying) {
        userPausedRef.paused = false;
        timeline.play();
      }
    };

    const handleIntersection: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          if (!timeline.paused()) {
            userPausedRef.paused = true;
            timeline.pause();
          }
        } else if (userPausedRef.paused && isPlaying) {
          userPausedRef.paused = false;
          timeline.play();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    let observer: IntersectionObserver | null = null;
    if (container && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(handleIntersection, { threshold: 0.1 });
      observer.observe(container);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      observer?.disconnect();
    };
  }, [timeline, isPlaying, containerRef]);
}
