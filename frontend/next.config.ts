import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
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
