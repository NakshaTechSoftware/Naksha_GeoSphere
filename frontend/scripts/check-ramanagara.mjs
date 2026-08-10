/**
 * Script to check Ramanagara district structure
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

async function checkRamanagara() {
  try {
    console.log('\n📁 Checking Ramanagara district structure...\n');
    
    // Check SubDistricts folder
    let command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/29_Ramanagara/',
      Delimiter: '/',
    });

    let response = await s3Client.send(command);
    console.log('Contents of 29_Ramanagara:');
    response.CommonPrefixes?.forEach(p => {
      const name = p.Prefix?.split('/').slice(-2)[0];
      console.log(`  📁 ${name}`);
    });
    
    // Check if SubDistricts or Sub_Districts exists
    command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/29_Ramanagara/SubDistricts/',
      Delimiter: '/',
    });
    response = await s3Client.send(command);
    
    if (response.CommonPrefixes && response.CommonPrefixes.length > 0) {
      console.log('\n📁 SubDistricts folder contains:');
      response.CommonPrefixes.forEach(p => {
        const name = p.Prefix?.split('/').slice(-2)[0];
        console.log(`  📁 ${name}`);
      });
    } else {
      console.log('\n⚠️  SubDistricts folder is empty or missing');
      
      // Try Sub_Districts
      command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: 'Administrative Boundaries/india/karnataka/Districts/29_Ramanagara/Sub_Districts/',
        Delimiter: '/',
      });
      response = await s3Client.send(command);
      
      if (response.CommonPrefixes && response.CommonPrefixes.length > 0) {
        console.log('\n📁 Sub_Districts folder contains:');
        response.CommonPrefixes.forEach(p => {
          const name = p.Prefix?.split('/').slice(-2)[0];
          console.log(`  📁 ${name}`);
        });
      } else {
        console.log('⚠️  Sub_Districts folder is also empty or missing');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRamanagara();
