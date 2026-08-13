import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Remote MinIO configuration - mirrors the other dataset routes (state-districts,
// bengaluru-boundary-list, etc.), which each hardcode the same shared storage server.
const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";
const GBA_PREFIX = "Administrative Boundaries/india/karnataka/GBA/";

// The GBA (Greater Bengaluru Authority) hierarchy - Authority -> Corporation -> Zone ->
// Ward - is a reprojected (EPSG:32643 -> EPSG:4326), topology-repaired export of the
// team's source shapefiles. Unlike the district/taluk/hobli/village hierarchy (one file
// per admin unit, matched by fuzzy folder name), each GBA level is a single flat file
// with every feature at that level; a request narrows down via property filters
// (Corporatio, zone_name) instead of a different object key per unit.
const GBA_FILES = {
  boundary: "gba_boundary.geojson",
  corporations: "gba_corporation_boundary.geojson",
  zones: "gba_zone_boundary.geojson",
  wards: "ward_369_final.geojson",
} as const;

export type GbaLevel = keyof typeof GBA_FILES;

// Every zone/ward click re-fetched and re-parsed the same handful of static files from
// remote storage from scratch - the ward file alone is ~4.6MB/369 features, so every
// single ward-level click paid a full S3 round-trip + JSON.parse even though the data
// never changes (it's a one-time upload, not live boundary data). Cache each level's
// parsed GeoJSON in memory for the life of this server process - this is what actually
// made drill-down clicks feel slow, not the per-request property filtering itself.
const gbaCache = new Map<GbaLevel, GeoJSON.FeatureCollection>();

export async function fetchGbaGeoJSON(level: GbaLevel): Promise<GeoJSON.FeatureCollection> {
  const cached = gbaCache.get(level);
  if (cached) return cached;

  const s3Client = new S3Client({
    endpoint: `http://${MINIO_ENDPOINT}`,
    region: S3_REGION,
    credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
    forcePathStyle: true,
  });

  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: `${GBA_PREFIX}${GBA_FILES[level]}` });
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  const fileResponse = await fetch(presignedUrl, { cache: "no-store" });
  if (!fileResponse.ok) {
    throw new Error(`MinIO returned ${fileResponse.status} for GBA level "${level}"`);
  }
  const collection = (await fileResponse.json()) as GeoJSON.FeatureCollection;
  gbaCache.set(level, collection);
  return collection;
}

const noStoreHeaders = {
  "Content-Type": "application/geo+json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Access-Control-Allow-Origin": "*",
};

export function gbaJsonResponse(collection: GeoJSON.FeatureCollection): Response {
  return new Response(JSON.stringify(collection), { headers: noStoreHeaders });
}

export function gbaErrorResponse(message: string, status = 500): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
