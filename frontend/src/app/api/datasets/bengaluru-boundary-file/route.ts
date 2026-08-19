import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';
const S3_PREFIX = 'Administrative Boundaries/india/karnataka/Bengaluru/';

export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');

    // Only allow fetching objects that actually live under the Bengaluru folder
    if (!key || !key.startsWith(S3_PREFIX)) {
      return NextResponse.json({ error: 'Invalid or missing key' }, { status: 400 });
    }

    const s3Client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
    });

    if (!fileResponse.ok) {
      console.error(`Failed to fetch file from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const fileBlob = await fileResponse.blob();
    const filename = key.split('/').pop() ?? 'file';

    return new NextResponse(fileBlob, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching Bengaluru boundary file:', error);
    return NextResponse.json(
      {
        error: 'Failed to load file',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
