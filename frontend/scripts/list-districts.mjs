/**
 * Script to list all district folders in Karnataka
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

async function listDistricts() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/',
      Delimiter: '/',
    });

    const response = await s3Client.send(command);
    
    console.log('\n📁 Karnataka District Folders:\n');
    
    if (response.CommonPrefixes) {
      response.CommonPrefixes.forEach((prefix, idx) => {
        const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
        console.log(`${idx + 1}. ${folderName}`);
      });
      console.log(`\nTotal: ${response.CommonPrefixes.length} districts\n`);
    } else {
      console.log('No district folders found\n');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

listDistricts();
