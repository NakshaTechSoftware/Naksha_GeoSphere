/**
 * Centralized, typed access to build-time/runtime environment configuration.
 * Never read `process.env` directly from components — go through here so
 * defaults and validation live in one place.
 */
export const config = {
  // Browser-facing API base URL. Empty string means "same origin" — the
  // request is sent to wherever the page was loaded from (the dev server,
  // the cloudflare tunnel, etc.) and a Next.js rewrite in next.config.ts
  // forwards /api/v1/* to the actual backend. This lets the mobile APK reach
  // the backend through the tunnel without hard-coding a LAN IP.
  // Always use relative URLs so the browser sends API requests to the same
  // origin (the dev server / cloudflare tunnel). A Next.js rewrite in
  // next.config.ts forwards /api/v1/* to the real backend. The old env-var
  // NEXT_PUBLIC_API_URL=http://localhost:8000 only worked when the browser
  // ran on the dev machine itself — it broke inside the Android WebView.
  apiUrl: "",
  // Server-only — used by Next.js route handlers, which run inside this
  // container. In Docker, "localhost" there is the container itself, not
  // the api service, so this must resolve on the container network (e.g.
  // the Docker Compose service name "api"). Falls back to the
  // browser-facing URL for non-containerized local dev, where both are
  // the same host.
  internalApiUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Naksha GeoSphere",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  // Must exactly match the backend's GOOGLE_REDIRECT_URI and the URI
  // registered in the Google Cloud console.
  googleRedirectUri:
    process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ??
    "",
  githubClientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "",
  // Must exactly match the backend's GITHUB_REDIRECT_URI and the callback
  // URL registered on the GitHub OAuth App.
  githubRedirectUri:
    process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI ??
    "",
} as const;
