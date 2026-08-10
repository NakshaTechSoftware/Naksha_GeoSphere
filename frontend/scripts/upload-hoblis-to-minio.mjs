/**
 * Uploads the Hoblis folders from the local KGIS dataset to remote MinIO, mirroring how the
 * Chikkamagaluru taluk was uploaded:
 *
 *   Local:  Districts/{district}/SubDistricts/{taluk}/Hoblis/{hobli}/{hobli}_village_boundary.geojson
 *   Remote: Administrative Boundaries/india/karnataka/{district}/SubDistricts/{taluk}/Hoblis/{hobli}/...
 *
 * The taluk-level {taluk}_hobli_boundary.geojson files already exist on the remote; only the
 * Hoblis trees are copied (additive PutObject, nothing is deleted or overwritten elsewhere).
 *
 * Name matching:
 *   - District: explicit alias table (local "Bengaluru South" IS the Ramanagara dataset),
 *     otherwise a live clean-name match against the remote district folders.
 *   - Taluk: case/punctuation-insensitive clean match against the remote SubDistricts folders
 *     (SubDistricts/ or Sub_Districts/, whichever exists). Mismatches are reported, not fatal.
 *
 * Usage (run from frontend/):
 *   node scripts/upload-hoblis-to-minio.mjs            # dry run (plan + mismatch report)
 *   node scripts/upload-hoblis-to-minio.mjs --execute  # perform the upload
 */

import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

// Local KGIS dataset root
const LOCAL_BASE = 'E:/Datasets routes/Karnataka KGIS Village Hierarchy/Karnataka/Districts';
// District aliases where the local folder name does not match the remote district.
// "Bengaluru South" contains Channapatna/Harohalli/Kanakpura/Magadi/Ramanagara = Ramanagara.
const DISTRICT_ALIASES = { 'Bengaluru South': '29_Ramanagara' };

// MinIO configuration (matches the API routes and other storage scripts)
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/Districts/';
const SUBDISTRICTS_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];

const EXECUTE = process.argv.includes('--execute');

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}`,
  region: S3_REGION,
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
  forcePathStyle: true,
});

// "17_Chikkamagaluru" / "Bengaluru (Urban)" / "K.R.Nagar" -> "chikkamagaluru" etc.
function cleanName(name) {
  return name
    .toLowerCase()
    .replace(/^\d+[-_]/, '')
    .replace(/[()]/g, ' ')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function listSubfolders(prefix) {
  const command = new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, Delimiter: '/' });
  const response = await s3Client.send(command);
  return (response.CommonPrefixes ?? []).map((p) => p.Prefix);
}

// Recursively lists files under a local directory, as [absolutePath, relativePosixPath].
function walkFiles(dir, relativePrefix = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...walkFiles(abs, rel));
    else results.push({ abs, rel });
  }
  return results;
}

async function main() {
  console.log(EXECUTE ? '⚙️  Mode: EXECUTE (will upload)' : '👁️  Mode: DRY RUN (plan only)');
  if (!existsSync(LOCAL_BASE)) {
    console.error(`❌ Local base not found: ${LOCAL_BASE}`);
    process.exit(1);
  }

  // 1. Remote district folders -> clean name map.
  const remoteDistricts = await listSubfolders(KARNATAKA_PREFIX);
  const remoteDistrictByClean = new Map(
    remoteDistricts.map((p) => [cleanName(p.split('/').slice(-2)[0]), p])
  );

  // 2. Walk every local district.
  const localDistricts = readdirSync(LOCAL_BASE, { withFileTypes: true }).filter((d) => d.isDirectory());
  const uploads = []; // { localFile, key, size }
  const districtReports = [];

  for (const districtDir of localDistricts) {
    const localDistrict = districtDir.name;
    const districtSub = join(LOCAL_BASE, localDistrict, 'SubDistricts');
    if (!existsSync(districtSub)) {
      districtReports.push({ localDistrict, remoteDistrict: null, note: 'no local SubDistricts folder' });
      continue;
    }

    const alias = DISTRICT_ALIASES[localDistrict];
    const remoteDistrictFolder = alias
      ? `${KARNATAKA_PREFIX}${alias}/`
      : remoteDistrictByClean.get(cleanName(localDistrict));

    if (!remoteDistrictFolder) {
      districtReports.push({ localDistrict, remoteDistrict: null, note: 'NO MATCHING REMOTE DISTRICT' });
      continue;
    }

    // 3. Remote SubDistricts variant + taluk entries. Taluks can be real subfolders
    // (".../SubDistricts/Kalasa/") or, for Ramanagara, bare per-taluk .geojson files
    // (".../Sub_Districts/Magadi.geojson") - derive the taluk names from the object keys
    // so both layouts resolve to the same "SubDistricts/{taluk}/" target.
    let subDistrictsPrefix = null;
    let remoteTalukNames = [];
    for (const variant of SUBDISTRICTS_VARIANTS) {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: `${remoteDistrictFolder}${variant}`,
      });
      const response = await s3Client.send(command);
      const segments = new Set();
      for (const obj of response.Contents ?? []) {
        const rest = obj.Key.slice((remoteDistrictFolder + variant).length);
        const first = rest.split('/')[0];
        if (first) segments.add(first);
      }
      if (segments.size > 0) {
        subDistrictsPrefix = `${remoteDistrictFolder}${variant}`;
        remoteTalukNames = [...segments];
        break;
      }
    }
    if (!subDistrictsPrefix) {
      districtReports.push({ localDistrict, remoteDistrict: null, note: 'remote district has no SubDistricts folder' });
      continue;
    }

    const remoteTalukByClean = new Map(
      remoteTalukNames.map((name) => {
        // Strip a trailing .geojson so Ramanagara's "Magadi.geojson" maps to folder "Magadi".
        const folder = name.replace(/\.geojson$/i, '');
        return [cleanName(folder), folder];
      })
    );

    // 4. Walk local taluks, match remote taluk folders, collect Hoblis uploads.
    const localTalukDirs = readdirSync(districtSub, { withFileTypes: true }).filter((d) => d.isDirectory());
    let matchedTaluks = 0;
    const unmatchedTaluks = [];
    for (const talukDir of localTalukDirs) {
      const localTaluk = talukDir.name;
      const hoblisDir = join(districtSub, localTaluk, 'Hoblis');
      if (!existsSync(hoblisDir)) continue; // taluk has no Hoblis locally - nothing to upload

      const remoteTaluk = remoteTalukByClean.get(cleanName(localTaluk));
      if (!remoteTaluk) {
        unmatchedTaluks.push(localTaluk);
        continue;
      }
      matchedTaluks++;

      const baseKey = `${subDistrictsPrefix}${remoteTaluk}/Hoblis/`;
      for (const { abs, rel } of walkFiles(hoblisDir)) {
        uploads.push({ localFile: abs, key: baseKey + rel, size: statSync(abs).size });
      }
    }

    districtReports.push({
      localDistrict,
      remoteDistrict: remoteDistrictFolder,
      matchedTaluks,
      unmatchedTaluks,
    });
  }

  // 5. Report.
  const totalSizeMb = (uploads.reduce((s, u) => s + u.size, 0) / (1024 * 1024)).toFixed(1);
  console.log(`\n📋 Upload plan: ${uploads.length} files, ${totalSizeMb} MB across ${districtReports.filter((d) => d.remoteDistrict).length} districts\n`);
  for (const rep of districtReports) {
    if (!rep.remoteDistrict) {
      console.log(`   ⛔ ${rep.localDistrict}: ${rep.note}`);
      continue;
    }
    const remoteName = rep.remoteDistrict.replace(/\/$/, '').split('/').pop();
    const extras = rep.unmatchedTaluks?.length
      ? ` | ⚠️  local taluks with NO remote folder: ${rep.unmatchedTaluks.join(', ')}`
      : '';
    const taluks = typeof rep.matchedTaluks === 'number' ? `${rep.matchedTaluks} taluks` : rep.note ?? '—';
    console.log(`   ✓ ${rep.localDistrict} -> ${remoteName} (${taluks})${extras ?? ''}`);
  }

  console.log(`\nSample target keys:`);
  uploads.slice(0, 5).forEach((u) => console.log(`   ${u.key}`));

  if (uploads.length === 0) {
    console.log('\n✅ Nothing to upload.');
    return;
  }
  if (!EXECUTE) {
    console.log('\nDry run complete - re-run with --execute to upload.');
    return;
  }

  // 6. Upload.
  let done = 0;
  let failed = 0;
  for (const { localFile, key, size } of uploads) {
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: createReadStream(localFile),
        ContentType: 'application/geo+json',
      }));
      done++;
      if (done % 50 === 0 || done === uploads.length) {
        console.log(`   Progress: ${done}/${uploads.length} files (${((done / uploads.length) * 100).toFixed(0)}%)`);
      }
    } catch (error) {
      failed++;
      console.error(`   ✗ Upload failed for ${key}: ${error.message}`);
    }
  }
  if (failed > 0) {
    console.error(`\n❌ ${failed} of ${uploads.length} uploads failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ Upload complete! ${done} files uploaded across ${districtReports.filter((d) => d.remoteDistrict).length} districts.`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
