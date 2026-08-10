import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const S3_KEY = 'Administrative Boundaries/india/karnataka/state-boundary/State.kmz';

export async function GET() {
  try {
    // Create S3 client for MinIO
    const s3Client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });
    
    // Create GetObject command
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: S3_KEY,
    });
    
    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });
    
    // Fetch the file using the presigned URL
    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
    });
    
    if (!fileResponse.ok) {
      console.error(`Failed to fetch KMZ from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }
    
    const kmzBlob = await fileResponse.blob();
    
    return new NextResponse(kmzBlob, {
      headers: {
        'Content-Type': 'application/vnd.google-earth.kmz',
        'Content-Disposition': 'inline; filename="State.kmz"',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
    
  } catch (error) {
    console.error('Error fetching KMZ:', error);
    return NextResponse.json(
      { 
        error: 'Failed to load KMZ file',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible'
      },
      { status: 500 }
    );
  }
}
