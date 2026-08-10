// Debug: verify applyVillageCutout's withVillageHole logic against real data.
// Fetches the states/districts/taluks/hoblies boundaries + the Hiremagaluru village
// polygon, replicates the hole-punch, and asserts the village area is now a hole in
// exactly the containing feature at each level.
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const S3 = new S3Client({
  endpoint: "http://192.168.10.81:9010",
  region: "geosphere",
  credentials: {
    accessKeyId: "geosphere_storage",
    secretAccessKey: "706f803f67c143c884305e7085b59210ffb29ac69e724a70",
  },
  forcePathStyle: true,
});

async function getJSON(key) {
  const obj = await S3.send(new GetObjectCommand({ Bucket: "geosphere-source-data", Key: key }));
  return JSON.parse(await obj.Body.transformToString());
}
async function listPrefix(prefix) {
  const r = await S3.send(new ListObjectsV2Command({ Bucket: "geosphere-source-data", Prefix: prefix }));
  return r.Contents?.map((c) => c.Key) ?? [];
}

function pointInRing(pt, ring) {
  const [x, y] = pt;
  if (x === undefined || y === undefined) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i], pj = ring[j];
    const xi = pi[0] ?? 0, yi = pi[1] ?? 0, xj = pj[0] ?? 0, yj = pj[1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInsidePolygon(pt, polygon) {
  const outer = polygon[0];
  if (!outer || !pointInRing(pt, outer)) return false;
  for (let i = 1; i < polygon.length; i++) if (pointInRing(pt, polygon[i])) return false;
  return true;
}

function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0, yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0, yj = ring[j]?.[1] ?? 0;
    area += xj * yi - xi * yj;
  }
  return area / 2;
}

// Replicates the FIXED withVillageHole: strictly-interior probe per village part, and the
// hole ring is reversed when its winding matches the outer ring (MapLibre only treats
// opposite-wound rings as holes).
function withVillageHole(data, villageGeometry) {
  const villageParts =
    villageGeometry.type === "MultiPolygon"
      ? villageGeometry.coordinates.map((p) => p[0] ?? [])
      : villageGeometry.type === "Polygon"
        ? [villageGeometry.coordinates[0] ?? []]
        : [];
  const partProbes = [];
  for (const part of villageParts) {
    if (!part.length) continue;
    const probe = interiorProbe({ type: "Polygon", coordinates: [part] });
    if (probe) partProbes.push({ part, probe });
  }
  if (!partProbes.length) return data;

  const features = data.features.map((feature) => {
    const geom = feature.geometry;
    if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) return feature;
    const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    const hits = [];
    for (const pp of partProbes) {
      for (const polygon of polygons) {
        if (pointInsidePolygon(pp.probe, polygon)) {
          hits.push(pp);
          break;
        }
      }
    }
    if (!hits.length) return feature;
    const copy = JSON.parse(JSON.stringify(feature));
    const copyPolys =
      copy.geometry.type === "Polygon"
        ? [copy.geometry.coordinates]
        : copy.geometry.coordinates;
    for (const pp of hits) {
      for (const polygon of copyPolys) {
        if (pointInsidePolygon(pp.probe, polygon)) {
          const outerRing = polygon[0] ?? [];
          const holeRing =
            outerRing.length && ringSignedArea(outerRing) * ringSignedArea(pp.part) >= 0
              ? [...pp.part].reverse()
              : pp.part;
          polygon.push(holeRing);
          break;
        }
      }
    }
    return copy;
  });
  return { type: "FeatureCollection", features };
}

// New: verify the hole ring's winding is OPPOSITE its outer ring (required for MapLibre to
// render it as a hole).
function holeWindingIsOpposite(ancestorData, villageRing) {
  for (const f of ancestorData.features) {
    const geom = f.geometry;
    const polys = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
    for (const poly of polys) {
      const outer = poly[0] ?? [];
      const outerSign = Math.sign(ringSignedArea(outer));
      if (!outerSign) continue;
      for (const hole of poly.slice(1)) {
        if (hole.length === villageRing.length) {
          const holeSign = Math.sign(ringSignedArea(hole));
          return { found: true, opposite: holeSign === -outerSign };
        }
      }
    }
  }
  return { found: false, opposite: false };
}

// Check: does a point inside the village land in a hole (not filled) of the given feature?
function villagePointInHole(ancestorData, villageRing, probe) {
  for (const f of ancestorData.features) {
    const geom = f.geometry;
    const polys = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
    for (const poly of polys) {
      // outer ring contains probe?
      if (pointInRing(probe, poly[0] ?? [])) {
        // is probe inside any hole ring?
        const inHole = poly.slice(1).some((hole) => pointInRing(probe, hole));
        const isVillageHole = poly.slice(1).some((hole) => hole === villageRing || hole.length === villageRing.length);
        return { contained: true, inHole, isVillageHole };
      }
    }
  }
  return { contained: false };
}

// Village polygon: Hiremagaluru, from the Kasaba village file
const TALUK_DIR = "Administrative Boundaries/india/karnataka/Districts/17_Chikkamagaluru/SubDistricts/Chikkamagaluru";
const VKEY = `${TALUK_DIR}/Hoblis/Kasaba/Kasaba_village_boundary.geojson`;
const villages = await getJSON(VKEY);
const villageFeat = villages.features.find((f) => f.properties?.KGISVillageName === "Hiremagaluru");
const villageGeom = villageFeat.geometry;
const firstRing =
  villageGeom.type === "Polygon"
    ? villageGeom.coordinates[0]
    : villageGeom.coordinates[0]?.[0];

// Strictly-interior probe: a ring vertex is ON the boundary, which makes the ray-casting
// hole test ambiguous. Grid-search the largest polygon part's bbox for an interior point.
function largestPolygonOf(geom) {
  const polys =
    geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0] ?? [];
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = poly;
    }
  }
  return best;
}
function interiorProbe(geom) {
  const poly = largestPolygonOf(geom);
  const ring = poly[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const c of ring) {
    minLng = Math.min(minLng, c[0]); minLat = Math.min(minLat, c[1]);
    maxLng = Math.max(maxLng, c[0]); maxLat = Math.max(maxLat, c[1]);
  }
  for (const res of [16, 32, 64]) {
    let best = null, bestDistSq = Infinity;
    const cx = (minLng + maxLng) / 2, cy = (minLat + maxLat) / 2;
    for (let i = 0; i <= res; i++) {
      for (let j = 0; j <= res; j++) {
        const pt = [minLng + ((maxLng - minLng) * i) / res, minLat + ((maxLat - minLat) * j) / res];
        if (!pointInsidePolygon(pt, poly)) continue;
        const d = (pt[0] - cx) ** 2 + (pt[1] - cy) ** 2;
        if (d < bestDistSq) { bestDistSq = d; best = pt; }
      }
    }
    if (best) return best;
  }
  return null;
}
const probe = interiorProbe(villageGeom);
console.log(`Village: Hiremagaluru, interior probe: [${probe.join(", ")}]`);

// --- Hoblies (the *_hobli_boundary.geojson file the taluk-hoblies route loads) ---
const hoblies = await getJSON(`${TALUK_DIR}/Chikkamagaluru_hobli_boundary.geojson`);
const hobliesHole = withVillageHole(hoblies, villageGeom);
const h = villagePointInHole(hobliesHole, firstRing, probe);
const hw = holeWindingIsOpposite(hobliesHole, firstRing);
console.log("HOBLI level:", h.contained && h.inHole ? "OK - village is a hole (fill cut)" : "FAIL - village still filled", `| winding: ${hw.found ? (hw.opposite ? "OK opposite" : "FAIL same") : "no hole found"}`);

// --- Taluks (the *_subdistrict_boundary.geojson file the district-taluks route loads) ---
const distKey = "Administrative Boundaries/india/karnataka/Districts/17_Chikkamagaluru/Chikkamagaluru_subdistrict_boundary.geojson";
const taluks = await getJSON(distKey);
const taluksHole = withVillageHole(taluks, villageGeom);
const t = villagePointInHole(taluksHole, firstRing, probe);
const tw = holeWindingIsOpposite(taluksHole, firstRing);
console.log("TALUK level:", t.contained && t.inHole ? "OK - village is a hole" : "FAIL - village still filled", `| winding: ${tw.found ? (tw.opposite ? "OK opposite" : "FAIL same") : "no hole found"}`);

// --- Districts (fetch from state-districts route data on MinIO) ---
const KARNATAKA_DIR = "Administrative Boundaries/india/karnataka/KARNATAKA/";
const distKeys = await listPrefix(KARNATAKA_DIR);
const distFile = distKeys.find((k) => k.toLowerCase().endsWith("karnataka_districts.geojson"));
if (!distFile) throw new Error("KARNATAKA_DISTRICTS.geojson not found");
const districts = await getJSON(distFile);
const districtsHole = withVillageHole(districts, villageGeom);
const d = villagePointInHole(districtsHole, firstRing, probe);
const dw = holeWindingIsOpposite(districtsHole, firstRing);
console.log("DISTRICT level:", d.contained && d.inHole ? "OK - village is a hole" : "FAIL - village still filled", `| winding: ${dw.found ? (dw.opposite ? "OK opposite" : "FAIL same") : "no hole found"}`);

// --- States (india_states.geojson from the app's public data) ---
import { readFileSync } from "fs";
const states = JSON.parse(readFileSync("public/data/india_states.geojson", "utf8"));
const statesHole = withVillageHole(states, villageGeom);
const s = villagePointInHole(statesHole, firstRing, probe);
const sw = holeWindingIsOpposite(statesHole, firstRing);
console.log("STATE level:", s.contained && s.inHole ? "OK - village is a hole" : "FAIL - village still filled", `| winding: ${sw.found ? (sw.opposite ? "OK opposite" : "FAIL same") : "no hole found"}`);

// Also confirm a NON-village point (inside Kasaba hobli but outside Hiremagaluru) stays filled
// at every ancestor level - the cutout must only punch the village area, nothing else.
const nameKey = Object.keys(villages.features[0]?.properties ?? {}).find((k) =>
  /name/i.test(k) && typeof villages.features[0].properties[k] === "string"
);
const otherVillage = villages.features.find(
  (f) => f.properties?.[nameKey] !== "Hiremagaluru" && f.geometry?.type !== "Point"
);
if (otherVillage?.geometry) {
  const nv = interiorProbe(otherVillage.geometry);
  console.log(`\nNon-village probe (inside ${otherVillage.properties[nameKey]}): [${nv.join(", ")}]`);
  const hb = withVillageHole(hoblies, villageGeom);
  const hv = villagePointInHole(hb, firstRing, nv);
  console.log("HOBLI non-village:", hv.contained && !hv.inHole ? "OK - stays filled" : "FAIL");
  const tb = withVillageHole(taluks, villageGeom);
  const tv = villagePointInHole(tb, firstRing, nv);
  console.log("TALUK non-village:", tv.contained && !tv.inHole ? "OK - stays filled" : "FAIL");
  const db = withVillageHole(districts, villageGeom);
  const dv = villagePointInHole(db, firstRing, nv);
  console.log("DISTRICT non-village:", dv.contained && !dv.inHole ? "OK - stays filled" : "FAIL");
  const sb = withVillageHole(states, villageGeom);
  const sv = villagePointInHole(sb, firstRing, nv);
  console.log("STATE non-village:", sv.contained && !sv.inHole ? "OK - stays filled" : "FAIL");
} else {
  console.log("\nNon-village probe: Chikkamagaluru village feature not found, skipping.");
}
