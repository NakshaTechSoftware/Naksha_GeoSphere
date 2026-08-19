"use client";

import { useEffect } from "react";

const HEADER_HEIGHT = 70;

/**
 * Mobile-only welcome-page behavior: the page is split into "parts" that each
 * fill a viewport. A scroll-down gesture from a part jumps straight to the
 * next one, and scrolling up jumps back to the previous one:
 *
 *   part 1 (hero)        <-> part 2 (feature cards)
 *   part 2 (feature)     <-> part 3 (Data Formats & Products)
 *   part 3 (data format) <-> part 4 (How It Works)
 *
 * Each jump re-arms whenever the user scrolls back to its start; desktop
 * (>= 768px) is untouched.
 */
export function FirstScrollJump() {
  useEffect(() => {
    if (window.innerWidth >= 768) return;

    const featuresEl = document.getElementById("features");
    const formatsEl = document.getElementById("data-formats");
    const howItWorksEl = document.getElementById("how-it-works");
    const trustEl = document.getElementById("trust");
    if (!featuresEl || !formatsEl || !howItWorksEl) return;

    // Absolute document positions of each part's landing point (top of the
    // section, minus the sticky header so it sits flush below it).
    const featuresLanding =
      featuresEl.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
    const formatsLanding =
      formatsEl.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
    const howItWorksLanding =
      howItWorksEl.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
    // Upper bound of part 4: the section after How It Works (or one viewport
    // down if that section is missing), so the reverse jump only fires while
    // the user is on the How It Works part itself.
    const howItWorksEnd = trustEl
      ? trustEl.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT
      : howItWorksLanding + window.innerHeight;

    let jumpedToFeatures = false;
    let jumpedToFormats = false;
    let jumpedToHowItWorks = false;
    let jumpedUpFromHowItWorks = false;
    let jumpedUpFromFormats = false;
    let jumpedUpFromFeatures = false;
    let touchStartY: number | null = null;
    let touchAccum = 0;

    const maybeJumpFeatures = (e: Event) => {
      if (jumpedToFeatures) return;
      // Only jump when the user is still at the hero (top of the page).
      if (window.scrollY > 40) return;
      // Stop the triggering gesture's own native scroll so the jump lands exactly.
      e.preventDefault();
      jumpedToFeatures = true;
      window.scrollTo({ top: featuresLanding, behavior: "smooth" });
    };

    const maybeJumpFormats = (e: Event) => {
      if (jumpedToFormats) return;
      const y = window.scrollY;
      // Only jump while the user is on the feature-cards part (between its
      // landing point and the start of the data-formats part).
      if (y < featuresLanding - 60 || y > formatsLanding - 60) return;
      e.preventDefault();
      jumpedToFormats = true;
      window.scrollTo({ top: formatsLanding, behavior: "smooth" });
    };

    const maybeJumpHowItWorks = (e: Event) => {
      if (jumpedToHowItWorks) return;
      const y = window.scrollY;
      // Only jump while the user is on the data-formats part.
      if (y < formatsLanding - 60 || y > howItWorksLanding - 60) return;
      e.preventDefault();
      jumpedToHowItWorks = true;
      window.scrollTo({ top: howItWorksLanding, behavior: "smooth" });
    };

    const maybeJumpUpFromHowItWorks = (e: Event) => {
      if (jumpedUpFromHowItWorks) return;
      const y = window.scrollY;
      // Only jump while the user is on the How It Works part.
      if (y < howItWorksLanding - 60 || y > howItWorksEnd - 60) return;
      e.preventDefault();
      jumpedUpFromHowItWorks = true;
      window.scrollTo({ top: formatsLanding, behavior: "smooth" });
    };

    const maybeJumpUpFromFormats = (e: Event) => {
      if (jumpedUpFromFormats) return;
      const y = window.scrollY;
      // Only jump while the user is on the data-formats part.
      if (y < formatsLanding - 60 || y > howItWorksLanding - 60) return;
      e.preventDefault();
      jumpedUpFromFormats = true;
      window.scrollTo({ top: featuresLanding, behavior: "smooth" });
    };

    const maybeJumpUpFromFeatures = (e: Event) => {
      if (jumpedUpFromFeatures) return;
      const y = window.scrollY;
      // Only jump while the user is on the feature-cards part.
      if (y < featuresLanding - 60 || y > formatsLanding - 60) return;
      e.preventDefault();
      jumpedUpFromFeatures = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 8) {
        if (window.scrollY <= 40) maybeJumpFeatures(e);
        else {
          // Scroll down: part 2 -> 3, part 3 -> 4 (whichever applies).
          maybeJumpFormats(e);
          maybeJumpHowItWorks(e);
        }
      } else if (e.deltaY < -8) {
        // Scroll up: part 4 -> 3, part 3 -> 2, part 2 -> 1.
        maybeJumpUpFromHowItWorks(e);
        maybeJumpUpFromFormats(e);
        maybeJumpUpFromFeatures(e);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
      touchAccum = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      const delta = touchStartY - y; // positive = finger up = scroll down
      touchAccum += delta;
      if (touchAccum > 24) {
        touchStartY = null;
        if (window.scrollY <= 40) maybeJumpFeatures(e);
        else {
          maybeJumpFormats(e);
          maybeJumpHowItWorks(e);
        }
      } else if (touchAccum < -24) {
        touchStartY = null;
        maybeJumpUpFromHowItWorks(e);
        maybeJumpUpFromFormats(e);
        maybeJumpUpFromFeatures(e);
      }
    };

    // Re-arm each jump when the user scrolls back to that part's start, so
    // every scroll gesture between parts jumps to the next one (not just once).
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= 40) jumpedToFeatures = false;
      if (Math.abs(y - featuresLanding) < 120) {
        jumpedToFormats = false;
        jumpedUpFromFeatures = false;
      }
      if (Math.abs(y - formatsLanding) < 120) {
        jumpedToHowItWorks = false;
        jumpedUpFromFormats = false;
      }
      if (Math.abs(y - howItWorksLanding) < 120) jumpedUpFromHowItWorks = false;
    };

    // Non-passive so the triggering gesture's scroll can be prevented and the
    // jump lands exactly on the target section.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
