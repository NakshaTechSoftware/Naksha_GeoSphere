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
  // Proxy all /api/v1/* requests (weather, auth, environment, …) to the FastAPI
  // backend so the mobile APK can reach it through the cloudflare tunnel.
  // Without this, calls to http://localhost:8000 from the phone's WebView fail
  // because localhost there refers to the phone itself.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/:path*`,
      },
      {
        // GeoAI Agent Service — LLM chat + streaming
        source: "/api/agent/:path*",
        destination: `${process.env.AGENT_API_URL ?? "http://localhost:8200"}/api/:path*`,
      },
      {
        // The agent service's actual liveness check lives at /health (no /api
        // prefix), so the rule above can't reach it - a separate rewrite is
        // needed rather than routing this through /api/agent/*. Exists so the
        // "Nibo online" indicator can be a cheap GET instead of the full LLM
        // agent turn a POST to /api/agent/chat would otherwise require.
        source: "/api/agent-health",
        destination: `${process.env.AGENT_API_URL ?? "http://localhost:8200"}/health`,
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
  serverExternalPackages: ["sharp", "@capacitor/filesystem", "@capacitor/share"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Capacitor packages only run inside Android/iOS WebViews.
      // Webpack cannot resolve the pnpm symlinks, so stub them on the web client.
      config.resolve = config.resolve || {};
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias["@capacitor/filesystem"] = false;
      config.resolve.alias["@capacitor/share"] = false;
    }
    return config;
  },
};

export default nextConfig;
