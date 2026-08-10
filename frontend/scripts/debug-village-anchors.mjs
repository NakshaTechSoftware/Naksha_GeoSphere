// Debug: analyze Chikkamagaluru/Kasaba village data for label-anchor issues.
// Recomputes the app's labelAnchorFeatures anchors and checks each anchor is
// inside ITS OWN village polygon (and reports any that are not).
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const S3 = new S3Client({
  endpoint: "http://192.168.10.81:9010",
  region: "geosphere",
  credentials: {
    accessKeyId: "geosphere_storage",
    secretAccessKey: "706f803f67c143c884305e7085b59210ffb29ac69e724a70",
  },
  forcePathStyle: true,
});

const VILLAGE_NAME_KEYS = ["KGISVillageName", "village_name", "Village_Name", "vill_nm", "village", "vname", "VILLNAME", "name"];

function ringAreaSqm(ring) {
  if (!ring || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    a += x0 * y1 - x1 * y0;
  }
  return (Math.abs(a / 2) * 111320 * 111320 * Math.cos((ring[0][1] * Math.PI) / 180)) / 1e6; // km²
}

function polyAreaSqm(poly) {
  return (poly?.[0] ?? []).length ? ringAreaSqm(poly[0]) : 0;
}

function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(pt, poly) {
  if (!pointInRing(pt, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(pt, poly[i])) return false;
  return true;
}

function nearestInteriorPoint(target, poly) {
  const outer = poly[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const c of outer) {
    if (c[0] === undefined || c[1] === undefined) continue;
    minLng = Math.min(minLng, c[0]); minLat = Math.min(minLat, c[1]);
    maxLng = Math.max(maxLng, c[0]); maxLat = Math.max(maxLat, c[1]);
  }
  for (const res of [16, 32, 64]) {
    let best = null, bestD = Infinity;
    for (let i = 0; i <= res; i++) for (let j = 0; j <= res; j++) {
      const lng = minLng + ((maxLng - minLng) * i) / res;
      const lat = minLat + ((maxLat - minLat) * j) / res;
      if (!pointInPoly([lng, lat], poly)) continue;
      const d = (lng - target[0]) ** 2 + (lat - target[1]) ** 2;
      if (d < bestD) { bestD = d; best = [lng, lat]; }
    }
    if (best) return best;
  }
  return null;
}

const KEY =
  "Administrative Boundaries/india/karnataka/Districts/17_Chikkamagaluru/SubDistricts/Chikkamagaluru/Hoblis/Kasaba/Kasaba_village_boundary.geojson";
const obj = await S3.send(new GetObjectCommand({ Bucket: "geosphere-source-data", Key: KEY }));
const data = JSON.parse(await obj.Body.transformToString());
console.log(`${data.features.length} features`);

const firstProps = data.features[0]?.properties ?? {};
const nameKey = VILLAGE_NAME_KEYS.find((k) => typeof firstProps[k] === "string") ?? "name";
console.log(`nameKey=${nameKey}`);

// --- replicate labelAnchorFeatures ---
const polygonsByName = new Map();
for (const f of data.features) {
  const name = f.properties?.[nameKey];
  if (!name) continue;
  const polys =
    f.geometry?.type === "MultiPolygon"
      ? f.geometry.coordinates
      : f.geometry?.type === "Polygon"
        ? [f.geometry.coordinates]
        : [];
  if (!polys.length) continue;
  const existing = polygonsByName.get(name);
  if (existing) existing.push(...polys);
  else polygonsByName.set(name, [...polys]);
}

const anchors = [];
for (const [name, polys] of polygonsByName) {
  let largest = null;
  let largestArea = -1;
  for (const p of polys) {
    const a = polyAreaSqm(p);
    if (a > largestArea) {
      largestArea = a;
      largest = p;
    }
  }
  if (!largest) continue;
  const ring = largest[0];
  const meanLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1e-9;
  let twiceArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const p1 = ring[i], p2 = ring[i + 1];
    const x0 = p1[0] * cosLat, x1 = p2[0] * cosLat;
    const cross = x0 * p1[1] - x1 * p2[1];
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (p1[1] + p2[1]) * cross;
  }
  const lng = twiceArea === 0 ? (Math.min(...ring.map((c) => c[0])) + Math.max(...ring.map((c) => c[0]))) / 2 : cx / (3 * twiceArea) / cosLat;
  const lat = twiceArea === 0 ? (Math.min(...ring.map((c) => c[1])) + Math.max(...ring.map((c) => c[1]))) / 2 : cy / (3 * twiceArea);

  // --- new: pull anchor inside its own polygon when the centroid falls outside ---
  let anchor = [lng, lat];
  if (!pointInPoly(anchor, largest)) {
    anchor = nearestInteriorPoint(anchor, largest) ?? anchor;
  }
  anchors.push({ name, lng: anchor[0], lat: anchor[1], areaKm2: largestArea, insideOwn: pointInPoly(anchor, largest) });
}

// Also: how many features carry each name? (to spot same-name different villages)
const nameCounts = new Map();
for (const f of data.features) {
  const n = f.properties?.[nameKey] ?? "(none)";
  nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
}

let bad = 0;
for (const a of anchors) {
  if (!a.insideOwn) bad++;
  console.log(
    `${a.insideOwn ? "OK " : "BAD"} ${a.name.padEnd(26)} area=${a.areaKm2.toFixed(2)}km² ${a.name in nameCounts ? "" : ""}`
  );
}
console.log(`\n${anchors.length} anchors, ${bad} OUTSIDE own polygon`);
const dups = [...nameCounts.entries()].filter(([, c]) => c > 1);
console.log(`Names with >1 feature: ${dups.length}`, dups.map(([n, c]) => `${n}x${c}`).join(", "));
