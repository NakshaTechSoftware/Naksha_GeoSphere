/**
 * Centralized, typed access to build-time/runtime environment configuration.
 * Never read `process.env` directly from components — go through here so
 * defaults and validation live in one place.
 */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8200",
  internalApiUrl: process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8200",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Naksha GeoSphere",
} as const;
