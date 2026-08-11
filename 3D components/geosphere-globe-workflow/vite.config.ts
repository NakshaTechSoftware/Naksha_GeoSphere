import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolated review prototype - plain Vite app. Geodata and assets live in /public.
export default defineConfig({
  plugins: [react()],
  // maplibre-gl v6 is ESM-only and imports its worker via `new URL(..., import.meta.url)`;
  // excluding it from the dep optimizer avoids broken worker resolution in dev.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
  server: {
    port: 5199,
    strictPort: true,
    open: false,
  },
  preview: {
    port: 5199,
    strictPort: true,
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.ts"],
    css: true,
    include: ["src/tests/**/*.test.{ts,tsx}"],
  },
});
