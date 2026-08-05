/**
 * The ONLY module in src/ allowed to touch Vite-specific APIs
 * (import.meta.env). Every other module — including workflow components —
 * receives configuration as plain values/props so the component tree can
 * be dropped into a Next.js app later with just this file swapped for an
 * equivalent adapter (e.g. reading process.env on the server, or a
 * runtime-injected <script> config on the client).
 */

export const DEV_FALLBACK_MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

export type MapEnvConfig = {
  styleUrl: string;
  accessToken: string | undefined;
  isFallbackStyle: boolean;
};

export function getMapEnvConfig(): MapEnvConfig {
  const configuredStyleUrl = import.meta.env.VITE_MAP_STYLE_URL?.trim();
  const accessToken = import.meta.env.VITE_MAP_ACCESS_TOKEN?.trim() || undefined;

  if (configuredStyleUrl) {
    return { styleUrl: configuredStyleUrl, accessToken, isFallbackStyle: false };
  }

  // No environment style configured — use the free MapLibre demo tiles.
  // This fallback is for DEVELOPMENT DEMONSTRATION ONLY and is not
  // suitable for production or commercial use.
  return { styleUrl: DEV_FALLBACK_MAP_STYLE_URL, accessToken: undefined, isFallbackStyle: true };
}

export const IS_TEST_MODE =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("testMode") === "true";
