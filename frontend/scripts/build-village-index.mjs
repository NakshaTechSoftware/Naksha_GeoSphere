/**
 * Builds frontend/public/data/karnataka_villages.json - an all-Karnataka village index
 * (one { district, taluk, hobli, village } entry per village), the same shape as the
 * hobli/taluk indexes. It walks the remote MinIO bucket: districts -> SubDistricts
 * (taluks) -> Hoblis -> Villages subfolders, and writes cleaned display names.
 *
 * Usage (from frontend/): node scripts/build-village-index.mjs
 */
import { writeFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/Districts/';
const SUBDISTRICT_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];
const HOBLIES_VARIANTS = ['Hoblis/', 'Hoblies/', 'hoblies/', 'hoblis/'];
const VILLAGES_VARIANTS = ['Villages/', 'Village/'];

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

// Lists immediate "segment names" under a prefix that may hold either subfolders or bare
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

// Strips a leading numeric code + separator and normalizes separators, matching the
// backend's cleanFolderName(). Title-cases only the first letter of each word and keeps
// the rest of each word's original case so dotted names like "B.Hosahalli" survive.
function displayName(name) {
  return name
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]/g, ' ')
    .replace(/[()]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  // 1. Districts
  const districtFolders = await listSubfolders(KARNATAKA_PREFIX);
  console.log(`Districts: ${districtFolders.length}`);

  // 2. Taluks per district (raw folder segment is what's used to walk deeper).
  const talukPairs = []; // { districtName, subPrefix, talukSegment }
  for (const district of districtFolders) {
    const districtName = displayName(district.split('/').slice(-2)[0]);
    const subPrefix = await findSubDistrictsPrefix(district);
    if (!subPrefix) continue;
    for (const talukSegment of await listSegmentNames(subPrefix)) {
      talukPairs.push({ districtName, subPrefix, talukSegment });
    }
  }
  console.log(`Taluks: ${talukPairs.length}`);

  // 3. Hobli prefixes per taluk.
  const hobliPrefixes = []; // { districtName, hobliPrefix, talukName, hobliName }
  let cursor = 0;
  const hobliWorkers = Array.from({ length: 16 }, async () => {
    while (cursor < talukPairs.length) {
      const pair = talukPairs[cursor++];
      const hobliesPrefix = `${pair.subPrefix}${pair.talukSegment}/`;
      for (const variant of HOBLIES_VARIANTS) {
        const hoblies = await listSegmentNames(`${hobliesPrefix}${variant}`);
        if (hoblies.length > 0) {
          for (const hobli of hoblies) {
            hobliPrefixes.push({
              districtName: pair.districtName,
              talukName: displayName(pair.talukSegment),
              hobliName: displayName(hobli),
              hobliesPrefix: `${hobliesPrefix}${variant}`,
            });
          }
          break;
        }
      }
    }
  });
  await Promise.all(hobliWorkers);
  console.log(`Hoblies: ${hobliPrefixes.length}`);

  // 4. Villages under each hobli's Villages/ folder, with a concurrency pool.
  const entries = [];
  cursor = 0;
  const villageWorkers = Array.from({ length: 16 }, async () => {
    while (cursor < hobliPrefixes.length) {
      const hobli = hobliPrefixes[cursor++];
      for (const variant of VILLAGES_VARIANTS) {
        const villages = await listSegmentNames(`${hobli.hobliesPrefix}${hobli.hobliName}/${variant}`);
        if (villages.length > 0) {
          for (const village of villages) {
            const name = displayName(village);
            if (name) {
              entries.push({
                district: hobli.districtName,
                taluk: hobli.talukName,
                hobli: hobli.hobliName,
                village: name,
              });
            }
          }
          break;
        }
      }
    }
  });
  await Promise.all(villageWorkers);

  entries.sort((a, b) =>
    a.district.localeCompare(b.district) ||
    a.taluk.localeCompare(b.taluk) ||
    a.hobli.localeCompare(b.hobli) ||
    a.village.localeCompare(b.village)
  );
  console.log(`Villages: ${entries.length}`);

  const out = new URL('../public/data/karnataka_villages.json', import.meta.url);
  writeFileSync(out, JSON.stringify(entries), 'utf8');
  const size = (Buffer.byteLength(JSON.stringify(entries), 'utf8') / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${entries.length} entries (${size} MB) to ${out.pathname}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
