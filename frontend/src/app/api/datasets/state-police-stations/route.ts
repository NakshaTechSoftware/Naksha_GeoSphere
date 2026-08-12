import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

// Maps a state name to the MinIO key holding that state's police-station
// jurisdiction boundaries. Only states with uploaded police data are listed.
const STATE_POLICE_KEYS: Record<string, string> = {
  karnataka: 'Police Station Boundaries/KARNATAKA_POLICE_STATIONS.geojson',
};

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get('state');
    const key = state ? STATE_POLICE_KEYS[state.trim().toLowerCase()] : undefined;

    if (!key) {
      return NextResponse.json(
        { error: `No police station boundary data available for "${state ?? ''}"` },
        { status: 404 }
      );
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
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!fileResponse.ok) {
      console.error(
        `Failed to fetch police station geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`
      );
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = await fileResponse.text();

    return new NextResponse(geojson, {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error fetching police station boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load police station boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
