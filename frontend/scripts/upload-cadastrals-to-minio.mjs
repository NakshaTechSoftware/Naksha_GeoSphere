/**
 * Uploads the cadastral "Villages" subfolders from the local KGIS cadastral share to remote
 * MinIO, mirroring the folder structure the village-cadastrals API route resolves:
 *
 *   Local:  //192.168.10.94/h/KGIS_Karnataka_Cadastral_Only/Karnataka/{district}/SubDistricts/{taluk}/Hoblis/{hobli}/Villages/{village}/...
 *   Remote: Administrative Boundaries/india/karnataka/Districts/{district}/SubDistricts/{taluk}/Hoblis/{hobli}/Villages/{village}/...
 *
 * Name matching:
 *   - District: explicit alias table (local "Bengaluru_South" IS the Ramanagara dataset),
 *     otherwise a live clean-name match against the remote numbered district folders
 *     (e.g. local "Chikkamagaluru" -> remote "17_Chikkamagaluru").
 *   - Taluk: case/punctuation-insensitive clean match against the remote SubDistricts folders
 *     (SubDistricts/ or Sub_Districts/, whichever exists).
 *   - Hobli: same clean match against the remote Hoblis folders (Hoblis/Hoblies/hoblies/hoblis).
 *   Mismatches are reported, not fatal.
 *
 * Uploads are additive and skip keys that already exist remotely (the Kasaba/Jagara village
 * data uploaded earlier is left untouched). Pass --force to overwrite existing keys.
 *
 * Usage (run from frontend/):
 *   node scripts/upload-cadastrals-to-minio.mjs            # dry run (plan + mismatch report)
 *   node scripts/upload-cadastrals-to-minio.mjs --execute  # perform the upload
 *   node scripts/upload-cadastrals-to-minio.mjs --execute --force  # overwrite existing keys
 */

import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

// Local KGIS cadastral dataset root (districts directly under Karnataka/)
const LOCAL_BASE = '//192.168.10.94/h/KGIS_Karnataka_Cadastral_Only/Karnataka';
// District aliases where the local folder name does not match the remote district.
// "Bengaluru_South" contains Channapatna/Harohalli/Kanakpura/Magadi/Ramanagara = Ramanagara.
const DISTRICT_ALIASES = { Bengaluru_South: '29_Ramanagara' };

// MinIO configuration (matches the API routes and other storage scripts)
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/Districts/';
const SUBDISTRICTS_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];
const HOBLIES_VARIANTS = ['Hoblis/', 'Hoblies/', 'hoblies/', 'hoblis/'];

const EXECUTE = process.argv.includes('--execute');
const FORCE = process.argv.includes('--force');

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}`,
  region: S3_REGION,
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
  forcePathStyle: true,
});

// "17_Chikkamagaluru" / "Bengaluru (Urban)" / "S.I.Sooraguppe" -> "chikkamagaluru" etc.
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

// Recursively lists every object key under a prefix (follows continuation tokens).
async function listAllObjects(prefix) {
  const keys = [];
  let token;
  do {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    });
    const response = await s3Client.send(command);
    for (const obj of response.Contents ?? []) keys.push(obj.Key);
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return keys;
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

// Resolves the remote taluk names under a district's SubDistricts/ (or Sub_Districts/) folder.
// Taluks can be real subfolders (".../SubDistricts/Kalasa/") or, for Ramanagara, bare
// per-taluk .geojson files (".../Sub_Districts/Magadi.geojson") - names are derived from the
// object keys so both layouts resolve to the same "SubDistricts/{taluk}/" target.
async function resolveRemoteTaluks(districtPrefix) {
  for (const variant of SUBDISTRICTS_VARIANTS) {
    const prefix = `${districtPrefix}${variant}`;
    const keys = await listAllObjects(prefix);
    const segments = new Set();
    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const first = rest.split('/')[0];
      if (first) segments.add(first.replace(/\.geojson$/i, ''));
    }
    if (segments.size > 0) return { prefix, names: [...segments] };
  }
  return null;
}

async function main() {
  console.log(EXECUTE ? '⚙️  Mode: EXECUTE (will upload)' : '👁️  Mode: DRY RUN (plan only)');
  console.log(`    Overwrite existing keys: ${FORCE ? 'YES (--force)' : 'no (skip existing)'}`);
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

    // 3. Remote SubDistricts variant + taluk names.
    const taluks = await resolveRemoteTaluks(remoteDistrictFolder);
    if (!taluks) {
      districtReports.push({ localDistrict, remoteDistrict: remoteDistrictFolder, note: 'remote district has no SubDistricts folder' });
      continue;
    }
    const remoteTalukByClean = new Map(taluks.names.map((name) => [cleanName(name), name]));

    // 4. Walk local taluks -> hoblies -> Villages folders.
    const localTalukDirs = readdirSync(districtSub, { withFileTypes: true }).filter((d) => d.isDirectory());
    let matchedTaluks = 0;
    const unmatchedTaluks = [];
    let districtUploads = 0;
    const hobliMismatches = [];

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

      // Remote hobli folders under the taluk's Hoblis/ (variants tolerated).
      let hobliPrefix = null;
      let remoteHobliByClean = new Map();
      for (const variant of HOBLIES_VARIANTS) {
        const folders = await listSubfolders(`${taluks.prefix}${remoteTaluk}/${variant}`);
        if (folders.length > 0) {
          hobliPrefix = `${taluks.prefix}${remoteTaluk}/${variant}`;
          remoteHobliByClean = new Map(
            folders.map((p) => [cleanName(p.split('/').slice(-2)[0]), p])
          );
          break;
        }
      }
      if (!hobliPrefix) {
        hobliMismatches.push(`${localTaluk}/<hoblies>`);
        continue;
      }

      const localHobliDirs = readdirSync(hoblisDir, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const hobliDir of localHobliDirs) {
        const localHobli = hobliDir.name;
        const villagesDir = join(hoblisDir, localHobli, 'Villages');
        if (!existsSync(villagesDir)) continue; // hobli has no Villages locally

        const remoteHobli = remoteHobliByClean.get(cleanName(localHobli));
        if (!remoteHobli) {
          hobliMismatches.push(`${localTaluk}/${localHobli}`);
          continue;
        }

        const baseKey = `${remoteHobli}Villages/`;
        for (const { abs, rel } of walkFiles(villagesDir)) {
          uploads.push({ localFile: abs, key: baseKey + rel, size: statSync(abs).size });
          districtUploads++;
        }
      }
    }

    districtReports.push({
      localDistrict,
      remoteDistrict: remoteDistrictFolder,
      matchedTaluks,
      unmatchedTaluks,
      hobliMismatches,
      uploads: districtUploads,
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
    const hobliNote = rep.hobliMismatches?.length
      ? ` | ⚠️  ${rep.hobliMismatches.length} hoblis with NO remote folder: ${rep.hobliMismatches.slice(0, 3).join(', ')}${rep.hobliMismatches.length > 3 ? '…' : ''}`
      : '';
    console.log(`   ✓ ${rep.localDistrict} -> ${remoteName} (${rep.matchedTaluks ?? '—'} taluks, ${rep.uploads ?? 0} files)${extras}${hobliNote}`);
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

  // 6. Compute which keys already exist remotely (skipped unless --force).
  let existingKeys = new Set();
  if (!FORCE) {
    console.log('\n🔍 Checking which target keys already exist remotely...');
    const targetPrefixes = new Set(uploads.map((u) => u.key.slice(0, u.key.lastIndexOf('/') + 1)));
    for (const prefix of targetPrefixes) {
      for (const key of await listAllObjects(prefix)) existingKeys.add(key);
    }
    const skipCount = uploads.filter((u) => existingKeys.has(u.key)).length;
    if (skipCount > 0) console.log(`   ${skipCount} of ${uploads.length} files already exist - skipping (use --force to overwrite).`);
  }

  // 7. Upload (small concurrency pool to keep the LAN link busy).
  const pending = uploads.filter((u) => FORCE || !existingKeys.has(u.key));
  console.log(`\n🚀 Uploading ${pending.length} files...`);
  let done = 0;
  let failed = 0;
  const CONCURRENCY = 6;
  const worker = async () => {
    while (true) {
      const job = pending.pop();
      if (!job) return;
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: job.key,
          Body: createReadStream(job.localFile),
          ContentType: job.key.toLowerCase().endsWith('.geojson') ? 'application/geo+json' : 'application/octet-stream',
        }));
        done++;
        if (done % 100 === 0 || done === pending.length) {
          console.log(`   Progress: ${done}/${pending.length} files (${((done / pending.length) * 100).toFixed(0)}%)`);
        }
      } catch (error) {
        failed++;
        console.error(`   ✗ Upload failed for ${job.key}: ${error.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failed > 0) {
    console.error(`\n❌ ${failed} of ${pending.length} uploads failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n✅ Upload complete! ${done} files uploaded across ${districtReports.filter((d) => d.remoteDistrict).length} districts.`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
