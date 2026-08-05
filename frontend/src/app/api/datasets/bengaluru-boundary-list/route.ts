import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const S3_PREFIX = 'india/karnataka/Bengaluru/';

export async function GET() {
  try {
    const s3Client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });

    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: S3_PREFIX,
    });

    const result = await s3Client.send(command);

    // Every object key under the Bengaluru/ folder, excluding the folder placeholder itself
    const keys = (result.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => !!key && key !== S3_PREFIX);

    return NextResponse.json({ keys });
  } catch (error) {
    console.error('Error listing Bengaluru boundary files:', error);
    return NextResponse.json(
      {
        error: 'Failed to list Bengaluru boundary files',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
