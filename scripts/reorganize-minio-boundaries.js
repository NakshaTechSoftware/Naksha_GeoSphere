/**
 * Script to reorganize MinIO storage structure
 * Moves india/ folder into Boundaries/india/
 * 
 * Run with: node scripts/reorganize-minio-boundaries.js
 */

const { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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

async function reorganizeBoundaries() {
  console.log('🚀 Starting MinIO storage reorganization...\n');
  console.log(`📦 Bucket: ${S3_BUCKET}`);
  console.log(`🔄 Moving: india/ → Boundaries/india/\n`);

  try {
    // Step 1: List all objects under india/
    console.log('📋 Step 1: Listing all objects under india/...');
    const objects = await listAllObjects('india/');
    console.log(`✓ Found ${objects.length} objects to move\n`);

    if (objects.length === 0) {
      console.log('⚠️  No objects found under india/. Nothing to move.');
      return;
    }

    // Step 2: Copy all objects to Boundaries/india/
    console.log('📦 Step 2: Copying objects to Boundaries/india/...');
    let copied = 0;
    let failed = 0;

    for (const obj of objects) {
      const sourceKey = obj.Key;
      const destKey = sourceKey.replace(/^india\//, 'Boundaries/india/');

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
    const verifyObjects = await listAllObjects('Boundaries/india/');
    console.log(`✓ Verified ${verifyObjects.length} objects in Boundaries/india/\n`);

    if (verifyObjects.length !== objects.length) {
      console.error('❌ ERROR: File count mismatch!');
      console.error(`   Expected: ${objects.length}, Found: ${verifyObjects.length}`);
      console.error('   Aborting deletion of old files for safety.');
      return;
    }

    // Step 4: Ask for confirmation before deletion
    console.log('⚠️  Step 4: Ready to delete old files from india/');
    console.log('   This will permanently delete the original files.');
    console.log('   Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 10000));

    console.log('🗑️  Deleting old files from india/...');
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

    console.log('✅ Reorganization complete!');
    console.log(`\n📁 New structure: ${S3_BUCKET}/Boundaries/india/...`);

  } catch (error) {
    console.error('❌ Error during reorganization:', error);
    process.exit(1);
  }
}

// Run the script
reorganizeBoundaries().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
