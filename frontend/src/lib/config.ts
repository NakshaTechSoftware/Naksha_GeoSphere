/**
 * Centralized, typed access to build-time/runtime environment configuration.
 * Never read `process.env` directly from components — go through here so
 * defaults and validation live in one place.
 */
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8200",
  internalApiUrl: process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8200",
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
