"use client";

import { AuthMapBackground, type MapBackdropLocation } from "./AuthMapBackground";

// A handful of visually distinct coastal/urban locations so the satellite
// backdrop varies between page loads instead of always showing the same spot.
const SIGNIN_LOCATIONS: MapBackdropLocation[] = [
  { center: [72.8258, 18.9388], zoom: 12.5 }, // Mumbai coastline
  { center: [55.14, 25.1124], zoom: 12.5 }, // Palm Jumeirah, Dubai
  { center: [151.2153, -33.852], zoom: 12.5 }, // Sydney Harbour
  { center: [-122.3893, 37.7913], zoom: 12 }, // San Francisco Bay
  { center: [103.8198, 1.264], zoom: 12.5 }, // Singapore coastline
  { center: [12.3388, 45.4342], zoom: 13 }, // Venice
];

export function SignInMapBackground() {
  return <AuthMapBackground locations={SIGNIN_LOCATIONS} filterId="signin-tritone" />;
}
