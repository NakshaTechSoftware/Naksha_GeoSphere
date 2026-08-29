#!/usr/bin/env node
/**
 * Copies the maplibre-gl worker script from node_modules into public/maplibre/
 * so Next.js can serve them (webpack rewrites import.meta.url, which breaks maplibre's
 * default worker resolution - see src/lib/maplibreWorker.ts).
 *
 * Run after upgrading maplibre-gl:  node scripts/sync-maplibre-worker.mjs
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public", "maplibre");

mkdirSync(destDir, { recursive: true });

// v6 uses .mjs worker + shared, v5 uses -csp-worker.js
const v6Worker = join(srcDir, "maplibre-gl-worker.mjs");
const v6Shared = join(srcDir, "maplibre-gl-shared.mjs");
const v5Worker = join(srcDir, "maplibre-gl-csp-worker.js");

if (existsSync(v6Worker) && existsSync(v6Shared)) {
  // maplibre-gl v6
  copyFileSync(v6Worker, join(destDir, "maplibre-gl-worker.mjs"));
  copyFileSync(v6Shared, join(destDir, "maplibre-gl-shared.mjs"));
  console.log("✓ synced v6 worker files (.mjs)");
} else if (existsSync(v5Worker)) {
  // maplibre-gl v5 — single self-contained worker script
  copyFileSync(v5Worker, join(destDir, "maplibre-gl-worker.js"));
  console.log("✓ synced v5 worker file (CSP worker)");
} else {
  console.error("No worker file found in", srcDir);
  process.exit(1);
}
console.log("Maplibre worker files synced to public/maplibre/");
