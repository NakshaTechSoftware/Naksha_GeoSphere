/**
 * Script to rename Boundaries folder to Administrative Boundaries
 * 
 * Run with: node scripts/rename-boundaries-folder.mjs
 */

import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

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
    
    if (response.Contents) {
      objects.push(...response.Contents);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

async function copyObject(sourceKey, destKey) {
  const command = new CopyObjectCommand({
    Bucket: S3_BUCKET,
    CopySource: `${S3_BUCKET}/${sourceKey}`,
    Key: destKey,
  });

  await s3Client.send(command);
}

async function deleteObject(key) {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

async function renameBoundariesFolder() {
  console.log('🚀 Starting MinIO folder rename...\n');
  console.log(`📦 Bucket: ${S3_BUCKET}`);
  console.log(`🔄 Renaming: Boundaries/ → Administrative Boundaries/\n`);

  try {
    // Step 1: List all objects under Boundaries/
    console.log('📋 Step 1: Listing all objects under Boundaries/...');
    const objects = await listAllObjects('Boundaries/');
    console.log(`✓ Found ${objects.length} objects to move\n`);

    if (objects.length === 0) {
      console.log('⚠️  No objects found under Boundaries/. Nothing to move.');
      return;
    }

    // Step 2: Copy all objects to Administrative Boundaries/
    console.log('📦 Step 2: Copying objects to Administrative Boundaries/...');
    let copied = 0;
    let failed = 0;

    for (const obj of objects) {
      const sourceKey = obj.Key;
      const destKey = sourceKey.replace(/^Boundaries\//, 'Administrative Boundaries/');

      try {
        await copyObject(sourceKey, destKey);
        copied++;
        
        if (copied % 10 === 0 || copied === objects.length) {
          process.stdout.write(`\r  Progress: ${copied}/${objects.length} files copied`);
        }
      } catch (error) {
        console.error(`\n  ✗ Failed to copy ${sourceKey}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n✓ Copied ${copied} files successfully`);
    if (failed > 0) {
      console.log(`✗ Failed to copy ${failed} files`);
    }

    // Step 3: Verify the copy
    console.log('\n🔍 Step 3: Verifying copied files...');
    const verifyObjects = await listAllObjects('Administrative Boundaries/');
    console.log(`✓ Verified ${verifyObjects.length} objects in Administrative Boundaries/\n`);

    if (verifyObjects.length !== objects.length) {
      console.error('❌ ERROR: File count mismatch!');
      console.error(`   Expected: ${objects.length}, Found: ${verifyObjects.length}`);
      console.error('   Aborting deletion of old files for safety.');
      return;
    }

    // Step 4: Ask for confirmation before deletion
    console.log('⚠️  Step 4: Ready to delete old files from Boundaries/');
    console.log('   This will permanently delete the original files.');
    console.log('   Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('🗑️  Deleting old files from Boundaries/...');
    let deleted = 0;

    for (const obj of objects) {
      try {
        await deleteObject(obj.Key);
        deleted++;
        
        if (deleted % 10 === 0 || deleted === objects.length) {
          process.stdout.write(`\r  Progress: ${deleted}/${objects.length} files deleted`);
        }
      } catch (error) {
        console.error(`\n  ✗ Failed to delete ${obj.Key}: ${error.message}`);
      }
    }

    console.log(`\n✓ Deleted ${deleted} old files\n`);

    console.log('✅ Rename complete!');
    console.log(`\n📁 New structure: ${S3_BUCKET}/Administrative Boundaries/india/...`);

  } catch (error) {
    console.error('❌ Error during rename:', error);
    process.exit(1);
  }
}

// Run the script
renameBoundariesFolder().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
