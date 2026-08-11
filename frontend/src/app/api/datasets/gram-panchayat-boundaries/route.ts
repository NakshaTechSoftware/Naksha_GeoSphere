import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cleanFolderName, namesMatch } from '../_folder-match';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get('state');
    const district = request.nextUrl.searchParams.get('district');
    const taluk = request.nextUrl.searchParams.get('taluk');

    if (!state || !district || !taluk) {
      return NextResponse.json(
        { error: 'state, district and taluk parameters are required' },
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
      forcePathStyle: true,
    });

    // Helper: list the direct children of a prefix and find the folder whose name matches
    // `displayName` (case/transliteration tolerant - see _folder-match.ts).
    const findFolder = async (parentPrefix: string, displayName: string) => {
      const listCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: parentPrefix,
        Delimiter: '/',
      });
      const listResponse = await s3Client.send(listCommand);
      return listResponse.CommonPrefixes?.find((prefix) => {
        const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
        return namesMatch(cleanFolderName(folderName), displayName);
      });
    };

    // Gram panchayat data lives under
    // "Gram Panchayat Boundaries/India/<State>/Districts/<District>/Taluk_Panchayats/<Taluk>/".
    // Match every level's folder name against the display names from the clicked features
    // (the GeoJSON's stname is uppercase while the folders are Title Case, and district/
    // taluk names tolerate transliteration differences like "Kalaburgi" vs "Kalaburagi").
    const stateFolder = await findFolder('Gram Panchayat Boundaries/India/', state);
    if (!stateFolder) {
      return NextResponse.json(
        { error: `Gram panchayat data not found for state "${state}"` },
        { status: 404 }
      );
    }

    const districtFolder = await findFolder(`${stateFolder.Prefix}Districts/`, district);
    if (!districtFolder) {
      return NextResponse.json(
        { error: `Gram panchayat district folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    const talukFolder = await findFolder(
      `${districtFolder.Prefix}Taluk_Panchayats/`,
      taluk
    );
    if (!talukFolder) {
      return NextResponse.json(
        { error: `Taluk_Panchayats folder not found for "${taluk}" in district "${district}"` },
        { status: 404 }
      );
    }

    // List the taluk folder's direct children and pick the gram panchayat boundaries file.
    const talukFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: talukFolder.Prefix,
      Delimiter: '/',
    });
    const talukFilesResponse = await s3Client.send(talukFilesCommand);

    const gpFile = talukFilesResponse.Contents?.find((file) => {
      const fileName = file.Key || '';
      return fileName.includes('_gram_panchayat_boundaries') && fileName.endsWith('.geojson');
    });

    if (!gpFile || !gpFile.Key) {
      return NextResponse.json(
        { error: `No gram panchayat boundaries file found for taluk "${taluk}"` },
        { status: 404 }
      );
    }

    // Fetch the gram panchayat boundaries GeoJSON file
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: gpFile.Key,
    });

    const presignedUrl = await getSignedUrl(s3Client, getCommand, {
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
      console.error(`Failed to fetch gram panchayat boundaries geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
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
    console.error('Error fetching gram panchayat boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load gram panchayat boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
