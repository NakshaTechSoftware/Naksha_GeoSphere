/**
 * Centralized, typed access to build-time/runtime environment configuration.
 * Never read `process.env` directly from components — go through here so
 * defaults and validation live in one place.
 */
export const config = {
  // Browser-facing — must be reachable from the user's machine (e.g. host
  // port mapping like http://localhost:8000, or a public API domain).
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  // Server-only — used by Next.js route handlers, which run inside this
  // container. In Docker, "localhost" there is the container itself, not
  // the api service, so this must resolve on the container network (e.g.
  // the Docker Compose service name "api"). Falls back to the
  // browser-facing URL for non-containerized local dev, where both are
  // the same host.
  internalApiUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Naksha GeoSphere",
} as const;
