import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolated review prototype - plain Vite app. Geodata and assets live in /public.
export default defineConfig({
  plugins: [react()],
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
