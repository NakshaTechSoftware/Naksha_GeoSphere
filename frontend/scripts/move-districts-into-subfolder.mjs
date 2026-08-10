/**
 * Moves the 31 numbered district folders under
 *   Administrative Boundaries/india/karnataka/
 * into a new
 *   Administrative Boundaries/india/karnataka/Districts/
 * subfolder, e.g. ".../karnataka/17_Chikkamagaluru/" -> ".../karnataka/Districts/17_Chikkamagaluru/".
 *
 * Only folders whose name starts with a district code (digits + underscore) are moved;
 * KARNATAKA/, dem/, lidar/, preview/, raster/, vector/ stay where they are.
 *
 * Safe pattern: copy every object -> verify the destination count matches -> delete the
 * old keys. Defaults to a read-only dry run; pass --execute to perform the move.
 *
 * Usage (run from frontend/):
 *   node scripts/move-districts-into-subfolder.mjs            # dry run
 *   node scripts/move-districts-into-subfolder.mjs --execute  # perform the move
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const KARNATAKA_PREFIX = 'Administrative Boundaries/india/karnataka/';
const DISTRICTS_PREFIX = `${KARNATAKA_PREFIX}Districts/`;

const EXECUTE = process.argv.includes('--execute');

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}`,
  region: S3_REGION,
  credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
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

async function listSubfolders(prefix) {
  const command = new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, Delimiter: '/' });
  const response = await s3Client.send(command);
  return (response.CommonPrefixes ?? []).map((p) => p.Prefix);
}

async function main() {
  console.log(EXECUTE ? '⚙️  Mode: EXECUTE (will move)' : '👁️  Mode: DRY RUN (plan only)');
  console.log(`📁 Source:   ${KARNATAKA_PREFIX}`);
  console.log(`📁 Target:   ${DISTRICTS_PREFIX}\n`);

  const subfolders = await listSubfolders(KARNATAKA_PREFIX);
  const districtFolders = subfolders.filter((p) => {
    const name = p.slice(KARNATAKA_PREFIX.length).replace(/\/$/, '');
    return /^\d+_/.test(name);
  });

  console.log(`Found ${districtFolders.length} district folder(s) to move:`);
  districtFolders.forEach((p) => console.log(`   ${p}`));

  const toMove = [];
  for (const folder of districtFolders) {
    const keys = (await listAllObjects(folder)).map((o) => o.Key);
    toMove.push({ folder, keys });
  }
  const totalObjects = toMove.reduce((s, m) => s + m.keys.length, 0);
  console.log(`\n📋 Move plan: ${toMove.length} folders, ${totalObjects} objects\n`);

  if (toMove.length === 0) {
    console.log('✅ Nothing to move.');
    return;
  }
  if (!EXECUTE) {
    console.log('Dry run complete - re-run with --execute to perform the move.');
    return;
  }

  let moved = 0;
  let failed = 0;
  for (const { folder, keys } of toMove) {
    const name = folder.slice(KARNATAKA_PREFIX.length).replace(/\/$/, '');
    const destPrefix = `${DISTRICTS_PREFIX}${name}/`;
    console.log(`📦 Moving "${name}"...`);

    let copyOk = true;
    for (const key of keys) {
      const destKey = key.replace(folder, destPrefix);
      try {
        await s3Client.send(new CopyObjectCommand({
          Bucket: S3_BUCKET,
          CopySource: `${S3_BUCKET}/${key}`,
          Key: destKey,
        }));
      } catch (error) {
        console.error(`   ✗ Copy failed for ${key}: ${error.message}`);
        copyOk = false;
        break;
      }
    }
    if (!copyOk) {
      failed += keys.length;
      continue;
    }

    // Verify the destination holds the same object count before deleting anything.
    const destObjects = await listAllObjects(destPrefix);
    if (destObjects.length !== keys.length) {
      console.error(`   ❌ VERIFY FAILED for "${name}" (expected ${keys.length}, found ${destObjects.length}). Skipping deletion.`);
      failed += keys.length;
      continue;
    }

    for (const key of keys) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    }
    console.log(`   ✓ Verified ${destObjects.length} objects, deleted ${keys.length} old`);
    moved++;
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} object(s) involved in failures - review output above.`);
    process.exitCode = 1;
    return;
  }

  // Final verification: no objects remain under the old district paths.
  let leftovers = 0;
  for (const { folder } of toMove) {
    leftovers += (await listAllObjects(folder)).length;
  }
  if (leftovers > 0) {
    console.error(`\n❌ ${leftovers} object(s) still under old district paths!`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Move complete! ${moved} district folders moved into ${DISTRICTS_PREFIX}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
