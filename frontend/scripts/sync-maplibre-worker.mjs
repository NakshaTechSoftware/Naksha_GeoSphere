#!/usr/bin/env node
/**
 * Copies the maplibre-gl worker + shared module from node_modules into public/maplibre/
 * so Next.js can serve them (webpack rewrites import.meta.url, which breaks maplibre's
 * default worker resolution - see src/lib/maplibreWorker.ts).
 *
 * Run after upgrading maplibre-gl:  node scripts/sync-maplibre-worker.mjs
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destDir, { recursive: true });
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
  console.log(`✓ copied ${file}`);
}
console.log("Maplibre worker files synced to public/maplibre/");
