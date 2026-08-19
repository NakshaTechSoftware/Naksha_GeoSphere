import path from "path";
import type { NextConfig } from "next";

// Build stamp: changes on every build, exposed via /api/version so the mobile app can
// detect a deployed update and reload instead of serving a stale cached page.
const appBuildId =
  process.env.APP_BUILD_ID ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  env: {
    APP_BUILD_ID: appBuildId,
  },
  async headers() {
    return [
      {
        // HTML documents (pages + API routes): never cache, so the browser/WebView
        // always re-fetches the latest build on every open.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        // Hashed static chunks are content-addressed per build - keep them cached
        // long-term (immutable) so the app doesn't re-download them on every open.
        // Defined after the page rule; later rules override earlier ones.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  // Hide the floating Next.js dev-tools button (bottom-left "N" badge) that
  // otherwise shows in the dev build the mobile app loads via the tunnel.
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // The repo root holds a pnpm-lock.yaml (plus a package-lock.json in this app), so Next
  // would otherwise infer the workspace root as E:\Naksha_GeoSphere and warn about it.
  // This app is standalone - pin the trace root to the frontend directory.
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/api/terrain/*": [
      "../DEM_Terrain/India_DEM.tif",
      "../DEM_Terrain/India_DEM_overview.tif",
    ],
  },
  serverExternalPackages: ["geotiff", "sharp"],
};

export default nextConfig;
