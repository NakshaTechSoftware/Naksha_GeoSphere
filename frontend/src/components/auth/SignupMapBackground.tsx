"use client";

import { AuthMapBackground, type MapBackdropLocation } from "./AuthMapBackground";

// A different set of locations than the sign-in page, so the two auth
// screens don't feel like duplicates of each other.
const SIGNUP_LOCATIONS: MapBackdropLocation[] = [
  { center: [-46.6558, -23.5878], zoom: 12.5 }, // Sao Paulo
  { center: [-0.0146, 51.5033], zoom: 12.5 }, // London, River Thames
  { center: [139.7745, 35.665], zoom: 12.5 }, // Tokyo Bay
  { center: [18.4232, -33.9187], zoom: 12.5 }, // Cape Town coastline
  { center: [2.2945, 48.8584], zoom: 13 }, // Paris
  { center: [114.1694, 22.3193], zoom: 12.5 }, // Hong Kong harbour
];

export function SignupMapBackground() {
  return <AuthMapBackground locations={SIGNUP_LOCATIONS} filterId="signup-tritone" />;
}
