import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // The repo root holds a pnpm-lock.yaml (plus a package-lock.json in this app), so Next
  // would otherwise infer the workspace root as E:\Naksha_GeoSphere and warn about it.
  // This app is standalone - pin the trace root to the frontend directory.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
