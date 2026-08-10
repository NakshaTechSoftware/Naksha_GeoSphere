/**
 * Verifies the FIXED labelAnchorFeatures logic against real Srinivaspura hobli data:
 * - groups polygons by name across ALL features
 * - picks the largest polygon by AREA per name
 * - computes the area-weighted centroid
 * - asserts the centroid falls inside its own polygon (ray-casting point-in-polygon)
 * Run from frontend/: node scripts/debug-hobli-anchors.mjs
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const c = new S3Client({ endpoint: 'http://192.168.10.81:9010', region: 'geosphere', credentials: { accessKeyId: 'geosphere_storage', secretAccessKey: '706f803f67c143c884305e7085b59210ffb29ac69e724a70' }, forcePathStyle: true });

function ringAreaSqm(ring) {
  const meanLat = ring.reduce((s, x) => s + x[1], 0) / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1e-9;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = (ring[i][0] * Math.PI / 180) * cosLat * R;
    const y1 = (ring[i][1] * Math.PI / 180) * R;
    const x2 = (ring[i + 1][0] * Math.PI / 180) * cosLat * R;
    const y2 = (ring[i + 1][1] * Math.PI / 180) * R;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function centroid(ring) {
  const meanLat = ring.reduce((s, x) => s + x[1], 0) / ring.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180) || 1e-9;
  let twiceArea = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0] * cosLat, lat0 = ring[i][1];
    const x1 = ring[i + 1][0] * cosLat, lat1 = ring[i + 1][1];
    const cross = x0 * lat1 - x1 * lat0;
    twiceArea += cross; cx += (x0 + x1) * cross; cy += (lat0 + lat1) * cross;
  }
  return { lng: cx / (3 * twiceArea) / cosLat, lat: cy / (3 * twiceArea) };
}

// Ray-casting point-in-polygon on the outer ring.
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const p = 'Administrative Boundaries/india/karnataka/Districts/19_Kolara/SubDistricts/Srinivaspura/';
const r = await c.send(new ListObjectsV2Command({ Bucket: 'geosphere-source-data', Prefix: p }));
const hobliFile = (r.Contents || []).find((x) => x.Key.toLowerCase().includes('hobli_boundary'));
const url = await getSignedUrl(c, new GetObjectCommand({ Bucket: 'geosphere-source-data', Key: hobliFile.Key }), { expiresIn: 300 });
const geo = await (await fetch(url)).json();

// Mirror the fixed labelAnchorFeatures: group polygons by name across ALL features.
const polygonsByName = new Map();
for (const f of geo.features) {
  const name = f.properties?.KGISHobliName || f.properties?.hobli_name || f.properties?.name;
  if (!name) continue;
  const polys = f.geometry?.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  if (!polys.length) continue;
  if (!polygonsByName.has(name)) polygonsByName.set(name, []);
  polygonsByName.get(name).push(...polys);
}

let allInside = true;
console.log('=== FIXED anchors (largest polygon by area per name) ===');
for (const [name, polygons] of polygonsByName) {
  let best = null, bestArea = -1;
  for (const poly of polygons) {
    const ring = poly[0];
    if (!ring || ring.length === 0) continue;      const a = ringAreaSqm(ring);
    if (a > bestArea) { bestArea = a; best = ring; }
  }
  if (!best) continue;
  const pt = centroid(best);
  const inside = pointInRing(pt.lng, pt.lat, best);
  if (!inside) allInside = false;
  console.log(`  ${name}: area=${(bestArea / 1e6).toFixed(1)} km²  centroid=(${pt.lng.toFixed(4)}, ${pt.lat.toFixed(4)})  insidePolygon=${inside}`);
}
console.log(allInside ? '\n✅ All label anchors are inside their own hobli polygons.' : '\n❌ Some anchors fall outside their polygon!');
