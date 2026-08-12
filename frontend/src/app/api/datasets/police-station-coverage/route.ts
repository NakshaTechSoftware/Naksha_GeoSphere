import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

const FOLDER_PREFIX = 'Police Station Boundaries/Police_Stations/';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

async function fetchGeojson(
  s3Client: S3Client,
  key: string
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });
    if (!fileResponse.ok) return null;
    const text = await fileResponse.text();
    return JSON.parse(text) as GeoJSON.FeatureCollection;
  } catch (error) {
    console.error(`Failed to fetch ${key} from MinIO:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const folder = request.nextUrl.searchParams.get('folder');
    if (!folder) {
      return NextResponse.json(
        { error: 'Missing required "folder" query parameter' },
        { status: 400 }
      );
    }

    // Guard against path traversal: the folder is a station folder name only.
    if (folder.includes('/') || folder.includes('..') || folder.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid folder name' },
        { status: 400 }
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

    const base = `${FOLDER_PREFIX}${folder}/`;
    const [hoblis, villages] = await Promise.all([
      fetchGeojson(s3Client, `${base}hoblis_in_police_area.geojson`),
      fetchGeojson(s3Client, `${base}villages_in_police_area.geojson`),
    ]);

    return NextResponse.json(
      {
        hoblis: hoblis ?? EMPTY_FC,
        villages: villages ?? EMPTY_FC,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching police station coverage:', error);
    return NextResponse.json(
      {
        error: 'Failed to load police station coverage',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
