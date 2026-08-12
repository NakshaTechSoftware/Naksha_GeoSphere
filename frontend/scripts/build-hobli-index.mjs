/**
 * Builds frontend/public/data/karnataka_hoblis.json - an all-Karnataka hobli index
 * (one { district, taluk, hobli } entry per hobli), the same shape as the hand-built
 * karnataka_taluks.json. It walks the remote MinIO bucket: districts -> SubDistricts
 * (taluks) -> Hoblis subfolders, and writes the cleaned display names.
 *
 * Usage (from frontend/): node scripts/build-hobli-index.mjs
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
// backend's cleanFolderName(). Title-cases each word for a readable display name.
function displayName(name) {
  return name
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]/g, ' ')
    .replace(/[()]/g, '')
    .trim()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

async function main() {
  // 1. Districts
  const districtFolders = await listSubfolders(KARNATAKA_PREFIX);
  console.log(`Districts: ${districtFolders.length}`);

  // 2. Taluks per district (with the working SubDistricts prefix cached). The RAW folder
  // segment (e.g. "07_Bangalore-South") is what must be used to walk deeper - the
  // display name ("Bangalore South") is only for the output entries.
  const pairs = []; // { districtName, subPrefix, talukSegment, talukName }
  for (const district of districtFolders) {
    const districtName = displayName(district.split('/').slice(-2)[0]);
    const subPrefix = await findSubDistrictsPrefix(district);
    if (!subPrefix) continue;
    for (const talukSegment of await listSegmentNames(subPrefix)) {
      pairs.push({
        districtName,
        subPrefix,
        talukSegment,
        talukName: displayName(talukSegment),
      });
    }
  }
  console.log(`Taluks: ${pairs.length}`);

  // 3. Hoblies per taluk, with a small concurrency pool (sequential MinIO round-trips
  // would take minutes).
  const entries = [];
  let cursor = 0;
  const workers = Array.from({ length: 16 }, async () => {
    while (cursor < pairs.length) {
      const pair = pairs[cursor++];
      const hobliesPrefix = `${pair.subPrefix}${pair.talukSegment}/`;
      for (const variant of HOBLIES_VARIANTS) {
        const hoblies = await listSegmentNames(`${hobliesPrefix}${variant}`);
        if (hoblies.length > 0) {
          for (const hobli of hoblies) {
            entries.push({ district: pair.districtName, taluk: pair.talukName, hobli: displayName(hobli) });
          }
          break;
        }
      }
    }
  });
  await Promise.all(workers);

  entries.sort((a, b) =>
    a.district.localeCompare(b.district) ||
    a.taluk.localeCompare(b.taluk) ||
    a.hobli.localeCompare(b.hobli)
  );
  console.log(`Hoblies: ${entries.length}`);

  const out = new URL('../public/data/karnataka_hoblis.json', import.meta.url);
  writeFileSync(out, JSON.stringify(entries, null, 2), 'utf8');
  console.log(`Wrote ${entries.length} entries to ${out.pathname}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
