/**
 * Renames the taluk (SubDistricts) subfolders of Karnataka districts in MinIO by
 * stripping the numeric prefix + underscore: e.g. "1709_Kalasa" -> "Kalasa".
 *
 * Defaults to a read-only dry run (prints the rename plan only). Pass --execute to
 * actually perform the renames (copy each object to the new key, verify the per-folder
 * object count matches, then delete the old keys).
 *
 * Usage:
 *   node scripts/rename-taluk-subfolders.mjs                              # dry run, single district
 *   node scripts/rename-taluk-subfolders.mjs --all                        # dry run, all districts
 *   node scripts/rename-taluk-subfolders.mjs --all --execute              # perform renames everywhere
 *   node scripts/rename-taluk-subfolders.mjs --district 23_Hassan         # other district
 *
 * Run from the frontend/ directory so @aws-sdk/client-s3 resolves.
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// MinIO configuration (matches the API routes and other storage scripts)
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

const EXECUTE = process.argv.includes('--execute');
// Deletes old numbered entries whose clean-named counterpart already exists with a
// matching object count (recovery path for renames where the verify step had skipped
// deletion, e.g. the Ramanagara file-style entries).
const CLEANUP = process.argv.includes('--cleanup');
const ALL_DISTRICTS = process.argv.includes('--all');
const DISTRICT_ARG = process.argv.find((arg) => arg.startsWith('--district='));
const DISTRICT_ARG_SPACE = process.argv.indexOf('--district');
const DISTRICT_FOLDER =
  DISTRICT_ARG?.split('=')[1] ??
  (DISTRICT_ARG_SPACE !== -1 ? process.argv[DISTRICT_ARG_SPACE + 1] : undefined) ??
  '17_Chikkamagaluru';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/Districts/';
const SUBDISTRICTS_FOLDER_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}`,
  region: S3_REGION,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

async function listAllObjects(prefix) {
  const objects = [];
  let continuationToken = undefined;
  do {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3Client.send(command);
    if (response.Contents) objects.push(...response.Contents);
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  return objects;
}

// Returns the subfolders (CommonPrefixes) directly under a prefix, e.g. district folders
// under karnataka/, or taluk folders under a district's SubDistricts/.
async function listSubfolders(prefix) {
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: prefix,
    Delimiter: '/',
  });
  const response = await s3Client.send(command);
  return (response.CommonPrefixes ?? []).map((p) => p.Prefix);
}

// Groups keys by the first path segment after the SubDistricts prefix (the taluk subfolder).
function groupBySubfolder(keys, subDistrictsPrefix) {
  const groups = new Map();
  for (const key of keys) {
    const rest = key.slice(subDistrictsPrefix.length);
    const folder = rest.split('/')[0];
    if (!folder) continue; // skip the folder-prefix marker object itself
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder).push(key);
  }
  return groups;
}

// "1709_Kalasa" -> "Kalasa". Returns null when there is no numeric prefix to strip.
function cleanSubfolderName(name) {
  const match = name.match(/^(\d+)_(.+)$/);
  if (!match) return null;
  return match[2];
}

// Finds the actual SubDistricts folder for a district (SubDistricts/ or Sub_Districts/).
async function findSubDistrictsPrefix(districtFolder) {
  for (const variant of SUBDISTRICTS_FOLDER_VARIANTS) {
    const prefix = `${districtFolder}${variant}`;
    const objects = await listAllObjects(prefix);
    if (objects.length > 0) return { prefix, objects };
  }
  return { prefix: null, objects: [] };
}

async function buildPlanForDistrict(districtFolder) {
  const { prefix, objects } = await findSubDistrictsPrefix(districtFolder);
  if (!prefix) return { districtFolder, prefix: null, plan: [], totalObjects: 0, skipped: [] };

  const groups = groupBySubfolder(objects.map((o) => o.Key), prefix);
  const plan = [];
  const skipped = [];
  for (const [folder, keys] of groups) {
    const newName = cleanSubfolderName(folder);
    if (!newName) {
      skipped.push(`"${folder}" (no prefix)`);
      continue;
    }
    if (groups.has(newName)) {
      skipped.push(`"${folder}" -> target "${newName}" already exists!`);
      continue;
    }
    plan.push({ folder, newName, keys });
  }
  const totalObjects = plan.reduce((sum, p) => sum + p.keys.length, 0);
  return { districtFolder, prefix, plan, totalObjects, skipped };
}

async function renameOneFolder(map, { folder, newName, keys }, subDistrictsPrefix) {
  const sourceBase = `${subDistrictsPrefix}${folder}`;
  const destPrefix = `${subDistrictsPrefix}${newName}/`;
  for (const key of keys) {
    // Keys are either "prefix/Folder/..." (real subfolders) or "prefix/File.geojson"
    // (Ramanagara-style files sitting directly in SubDistricts) - map each correctly.
    const destKey = key.startsWith(`${sourceBase}/`)
      ? key.replace(`${sourceBase}/`, destPrefix)
      : `${subDistrictsPrefix}${newName}`;
    try {
      await s3Client.send(new CopyObjectCommand({
        Bucket: S3_BUCKET,
        CopySource: `${S3_BUCKET}/${key}`,
        Key: destKey,
      }));
    } catch (error) {
      console.error(`   ✗ Copy failed for ${key}: ${error.message}`);
      return false;
    }
  }

  // Verify the destination holds exactly the same number of objects before deleting.
  // No trailing slash: matches both real subfolders ("Kalasa/...") and bare files
  // ("Magadi.geojson") - the file case would be missed by a ".../Name/" prefix.
  const destVerifyPrefix = `${subDistrictsPrefix}${newName}`;
  const destObjects = await listAllObjects(destVerifyPrefix);
  if (destObjects.length !== keys.length) {
    console.error(`   ❌ VERIFY FAILED for "${newName}" (expected ${keys.length}, found ${destObjects.length}). Skipping deletion.`);
    return false;
  }
  console.log(`   ✓ Verified ${destObjects.length} objects under "${newName}/"`);

  for (const key of keys) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  }
  return true;
}

// Cleanup mode: for every numbered entry still present, delete it only if the clean-named
// counterpart exists and holds at least as many objects. Safe against partial renames.
async function runCleanup(districtFolders) {
  console.log('🧹 Mode: CLEANUP (delete old numbered entries with verified clean counterparts)');
  let deleted = 0;
  let failed = 0;
  for (const districtFolder of districtFolders) {
    const { prefix, objects } = await findSubDistrictsPrefix(districtFolder);
    if (!prefix) continue;
    const districtName = districtFolder.slice(KARNATAKA_PREFIX.length);
    const groups = groupBySubfolder(objects.map((o) => o.Key), prefix);

    for (const [folder, keys] of groups) {
      const newName = cleanSubfolderName(folder);
      if (!newName) continue; // already clean
      const targetKeys = groups.get(newName);
      if (!targetKeys || targetKeys.length < keys.length) {
        console.error(`   ⛔ [${districtName}] "${folder}" - clean counterpart "${newName}" missing or short (${targetKeys?.length ?? 0} < ${keys.length}). Skipping.`);
        failed += keys.length;
        continue;
      }
      for (const key of keys) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        deleted++;
      }
      console.log(`   🗑️  [${districtName}] Deleted ${keys.length} old object(s) from "${folder}" (counterpart "${newName}" verified)`);
    }
  }
  if (failed > 0) {
    console.error(`\n❌ ${failed} object(s) left because their clean counterpart was missing or short.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✅ Cleanup complete - ${deleted} old object(s) removed.`);
  }
}

async function main() {
  console.log(CLEANUP ? '🧹 Cleanup run' : EXECUTE ? '⚙️  Mode: EXECUTE (will rename)' : '👁️  Mode: DRY RUN (plan only)');

  let districtFolders;
  if (ALL_DISTRICTS) {
    console.log('📁 Districts: ALL under karnataka/\n');
    districtFolders = await listSubfolders(KARNATAKA_PREFIX);
    console.log(`   Found ${districtFolders.length} district folder(s):`);
    districtFolders.forEach((f) => console.log(`   - ${f}`));
    console.log('');
  } else {
    districtFolders = [`${KARNATAKA_PREFIX}${DISTRICT_FOLDER}/`];
    console.log(`📁 District: ${DISTRICT_FOLDER}\n`);
  }

  if (CLEANUP) {
    await runCleanup(districtFolders);
    return;
  }

  // Phase 1: build the full plan across all target districts.
  const districtPlans = [];
  let totalFolders = 0;
  let totalObjects = 0;
  for (const districtFolder of districtFolders) {
    const dp = await buildPlanForDistrict(districtFolder);
    districtPlans.push(dp);
    totalFolders += dp.plan.length;
    totalObjects += dp.totalObjects;
  }

  console.log(`📋 Rename plan across ${districtPlans.length} district(s): ${totalFolders} folders, ${totalObjects} objects\n`);
  for (const dp of districtPlans) {
    const districtName = dp.districtFolder.slice(KARNATAKA_PREFIX.length);
    if (!dp.prefix) {
      console.log(`   ${districtName}: no SubDistricts folder found - skipped`);
      continue;
    }
    console.log(`   ${districtName}:`);
    for (const { folder, newName, keys } of dp.plan) {
      console.log(`     ${folder}/  ->  ${newName}/  (${keys.length} objects)`);
    }
    for (const s of dp.skipped) {
      console.log(`     ⏭️  ${s}`);
    }
  }
  console.log('');

  if (totalFolders === 0) {
    console.log('✅ Nothing to rename.');
    return;
  }

  if (!EXECUTE) {
    console.log('Dry run complete - re-run with --all --execute to perform the renames.');
    return;
  }

  // Phase 2: execute per district, per folder (copy -> verify -> delete).
  let renamed = 0;
  let failed = 0;
  for (const dp of districtPlans) {
    if (!dp.prefix) continue;
    const districtName = dp.districtFolder.slice(KARNATAKA_PREFIX.length);
    for (const item of dp.plan) {
      console.log(`📦 [${districtName}] "${item.folder}" -> "${item.newName}"...`);
      const ok = await renameOneFolder({}, item, dp.prefix);
      if (ok) {
        renamed++;
        console.log(`   🗑️  Deleted ${item.keys.length} old objects from "${item.folder}/"`);
      } else {
        failed++;
      }
    }
  }

  if (failed > 0) {
    console.error(`\n❌ Finished with ${failed} failed folder(s) - review the output above.`);
    process.exitCode = 1;
    return;
  }

  // Phase 3: final verification - no objects may remain under a numbered subfolder anywhere.
  let leftovers = 0;
  for (const dp of districtPlans) {
    if (!dp.prefix) continue;
    const after = await listAllObjects(dp.prefix);
    leftovers += after.filter((o) => {
      const first = o.Key.slice(dp.prefix.length).split('/')[0];
      return cleanSubfolderName(first) !== null;
    }).length;
  }
  if (leftovers > 0) {
    console.error(`\n❌ ${leftovers} objects still under numbered subfolders!`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Rename complete! ${renamed} taluk subfolders renamed across ${districtPlans.length} district(s).`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
