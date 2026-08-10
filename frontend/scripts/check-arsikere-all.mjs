/**
 * Script to check all contents of Arsikere folder
 */

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

async function checkAriskereAll() {
  try {
    console.log('\n📁 Listing ALL contents of Arsikere folder...\n');
    
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/23_Hassan/SubDistricts/2303_Arsikere/',
    });
    const response = await s3Client.send(command);
    
    if (response.Contents) {
      console.log(`Found ${response.Contents.length} files/objects:\n`);
      response.Contents.forEach(obj => {
        const path = obj.Key?.replace('Administrative Boundaries/india/karnataka/Districts/23_Hassan/SubDistricts/2303_Arsikere/', '');
        const size = (obj.Size || 0) / 1024;
        console.log(`  ${path} (${size.toFixed(1)} KB)`);
      });
    } else {
      console.log('No files found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAriskereAll();
