/**
 * Counts the Karnataka administrative hierarchy on the remote MinIO bucket:
 * districts, taluks (SubDistricts/Sub_Districts), hoblies (Hoblis variants), villages
 * (Villages/ subfolders). Used to populate the right-click attribute popup for Karnataka.
 */
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/Districts/';
const SUBDISTRICT_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];
const HOBLIES_VARIANTS = ['Hoblis/', 'Hoblies/', 'hoblies/', 'hoblis/'];

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}`,
  region: S3_REGION,
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
  forcePathStyle: true,
});

async function listSubfolders(prefix) {
  const response = await s3Client.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, Delimiter: '/' })
  );
  return (response.CommonPrefixes ?? []).map((p) => p.Prefix);
}

// Counts immediate "segment names" under a prefix that may hold either subfolders or bare
// .geojson files (e.g. Ramanagara's Sub_Districts/{Taluk}.geojson layout).
async function listSegmentNames(prefix) {
  const segments = new Set();
  let token;
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        Delimiter: '/',
        ContinuationToken: token,
      })
    );
    for (const p of response.CommonPrefixes ?? []) {
      segments.add(p.Prefix.split('/').slice(-2)[0]);
    }
    for (const obj of response.Contents ?? []) {
      const rest = obj.Key.slice(prefix.length);
      const first = rest.split('/')[0];
      if (first) segments.add(first.replace(/\.geojson$/i, ''));
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return [...segments];
}

async function findSubDistrictsPrefix(districtPrefix) {
  for (const variant of SUBDISTRICT_VARIANTS) {
    const names = await listSegmentNames(`${districtPrefix}${variant}`);
    if (names.length > 0) return `${districtPrefix}${variant}`;
  }
  return null;
}

async function findVillagesFolder(hobliPrefix) {
  for (const variant of ['Villages/', 'Village/']) {
    const folders = await listSubfolders(`${hobliPrefix}${variant}`);
    if (folders.length > 0) return `${hobliPrefix}${variant}`;
  }
  return null;
}

async function main() {
  // 1. Districts
  const districts = await listSubfolders(KARNATAKA_PREFIX);
  console.log(`Districts: ${districts.length}`);

  // 2. Taluks (with per-district SubDistricts prefix cached)
  const taluksByDistrict = new Map(); // districtPrefix -> { subPrefix, taluks: string[] }
  let talukCount = 0;
  for (const district of districts) {
    const subPrefix = await findSubDistrictsPrefix(district);
    if (!subPrefix) continue;
    const taluks = await listSegmentNames(subPrefix);
    taluksByDistrict.set(district, { subPrefix, taluks });
    talukCount += taluks.length;
  }
  console.log(`Taluks: ${talukCount}`);

  // 3. Hoblies (with per-taluk hobli names cached)
  const hobliesByKey = new Map(); // `${district}|${taluk}` -> hobli names
  let hobliCount = 0;
  for (const [district, { subPrefix, taluks }] of taluksByDistrict) {
    for (const taluk of taluks) {
      const hobliesPrefix = `${subPrefix}${taluk}/`;
      for (const variant of HOBLIES_VARIANTS) {
        const hoblies = await listSegmentNames(`${hobliesPrefix}${variant}`);
        if (hoblies.length > 0) {
          hobliesByKey.set(`${district}|${taluk}`, { hobliesPrefix: `${hobliesPrefix}${variant}`, hoblies });
          hobliCount += hoblies.length;
          break;
        }
      }
    }
  }
  console.log(`Hoblis (Revenue Circles): ${hobliCount}`);

  // 4. Villages (count village subfolders under each hobli's Villages/)
  let villageCount = 0;
  for (const [district, { taluks }] of taluksByDistrict) {
    for (const taluk of taluks) {
      const entry = hobliesByKey.get(`${district}|${taluk}`);
      if (!entry) continue;
      for (const hobli of entry.hoblies) {
        const villagesFolder = await findVillagesFolder(`${entry.hobliesPrefix}${hobli}/`);
        if (!villagesFolder) continue;
        villageCount += (await listSubfolders(villagesFolder)).length;
      }
    }
  }
  console.log(`Villages: ${villageCount}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
