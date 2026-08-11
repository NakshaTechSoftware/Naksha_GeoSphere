// One-time geodata preparation script.
// Derives the three local GeoJSON files from the REAL geometry already present in the
// Naksha GeoSphere project (frontend/public/data/india_states.geojson, KGIS-sourced).
// Run: node scripts/prepare-geodata.mjs
import fs from "fs";
import { feature, featureCollection, multiPolygon, union } from "@turf/turf";
import { feature as topoFeature } from "topojson-client";

// Script lives at <prototype>/scripts/. Source is the real project data (../.. from
// prototype root -> repo root -> frontend/public/data).
const SOURCE = new URL("../../../frontend/public/data/india_states.geojson", import.meta.url);
const OUT = new URL("../public/geodata/", import.meta.url);

const states = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
console.log("states loaded:", states.features.length);

// 1) Verbatim real states geometry.
fs.writeFileSync(new URL("india-states.geojson", OUT), JSON.stringify(states));

// 2) Karnataka feature extracted from the real data.
const ka = states.features.find(
  (f) => (f.properties.st_nm || "").toLowerCase() === "karnataka"
);
if (!ka) throw new Error("Karnataka feature not found");
fs.writeFileSync(
  new URL("karnataka-boundary.geojson", OUT),
  JSON.stringify({ type: "FeatureCollection", features: [ka] })
);
console.log("karnataka written:", ka.geometry.type);

// 3) India outline: merge every state polygon into one MultiPolygon. States share borders,
// so a raw ring merge would leave internal seams; union-fold resolves shared edges. Falls
// back to the flattened ring set if union is too slow for the source fidelity.
let india;
try {
  india = states.features
    .map((f) => feature(f.geometry, {}))
    .reduce((acc, f) => (acc ? union(acc, f) : f), null);
} catch {
  india = null;
}
if (!india) {
  const polys = states.features
    .map((f) =>
      f.geometry.type === "Polygon"
        ? f.geometry.coordinates
        : f.geometry.coordinates
    )
    .flat();
  india = multiPolygon(polys, {});
}
fs.writeFileSync(
  new URL("india-boundary.geojson", OUT),
  JSON.stringify(featureCollection([india]))
);
console.log("india-boundary written:", india.geometry.type);

// 4) World land (all continents) from Natural Earth 110m, packaged by the public-domain
//    world-atlas npm package as TopoJSON. Converted to GeoJSON so the globe shows real
//    continents from the first frame (no external API at runtime).
const worldTopo = JSON.parse(
  fs.readFileSync(
    new URL("../node_modules/world-atlas/countries-110m.json", import.meta.url),
    "utf8"
  )
);
const worldLand = topoFeature(worldTopo, worldTopo.objects.countries);
fs.writeFileSync(
  new URL("world-land.geojson", OUT),
  JSON.stringify(worldLand)
);
console.log(
  "world-land written:",
  worldLand.features.length,
  "country polygons (Natural Earth 110m)"
);
