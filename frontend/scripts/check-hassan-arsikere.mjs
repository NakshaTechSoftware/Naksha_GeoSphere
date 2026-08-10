/**
 * Script to check Hassan > Arsikere > Hoblies structure
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

async function checkHassanArsikere() {
  try {
    console.log('\n📁 Checking Hassan district structure...\n');
    
    // Check SubDistricts
    let command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/23_Hassan/SubDistricts/',
      Delimiter: '/',
    });
    let response = await s3Client.send(command);
    
    console.log('Hassan SubDistricts (Taluks):');
    if (response.CommonPrefixes) {
      response.CommonPrefixes.forEach(p => {
        const name = p.Prefix?.split('/').slice(-2)[0];
        console.log(`  📁 ${name}`);
      });
    }
    
    // Check Arsikere Hoblies folder
    console.log('\n📁 Checking Arsikere Hoblies folder...\n');
    command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Administrative Boundaries/india/karnataka/Districts/23_Hassan/SubDistricts/2303_Arsikere/Hoblies/',
      Delimiter: '/',
    });
    response = await s3Client.send(command);
    
    if (response.CommonPrefixes && response.CommonPrefixes.length > 0) {
      console.log('Arsikere Hoblies:');
      for (const prefix of response.CommonPrefixes) {
        const hobliName = prefix.Prefix?.split('/').slice(-2)[0];
        console.log(`\n  📁 ${hobliName}`);
        
        // Check files in each hobli
        const filesCommand = new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: prefix.Prefix,
        });
        const filesResponse = await s3Client.send(filesCommand);
        
        if (filesResponse.Contents) {
          filesResponse.Contents.forEach(file => {
            const fileName = file.Key?.split('/').pop();
            const size = (file.Size || 0) / 1024;
            console.log(`      📄 ${fileName} (${size.toFixed(1)} KB)`);
          });
        }
      }
    } else {
      console.log('⚠️  No Hoblies folder found or it\'s empty');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkHassanArsikere();
