import "@testing-library/jest-dom";

// jsdom does not implement matchMedia; the components use it for prefers-reduced-motion.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// GSAP in jsdom: drive the ticker manually so tests can flush timelines deterministically.
import { gsap } from "gsap";

// The installed GSAP typings declare the ticker methods as no-arg; jsdom tests need the
// timestamp variants, so widen the signature.
const ticker = gsap.ticker as unknown as {
  lagSmoothing: (threshold: number) => void;
  tick: (time: number) => void;
};

ticker.lagSmoothing?.(0);

/** Advance GSAP's virtual clock by `seconds` and flush. Uses a huge monotonic base so the
 * timeline advances even if an earlier test left the ticker time high. */
export function tickGap(seconds: number): void {
  const base = 1_000_000;
  const step = seconds * 1000;
  for (let t = 0; t <= step; t += 16) {
    ticker.tick(base + t);
  }
}
