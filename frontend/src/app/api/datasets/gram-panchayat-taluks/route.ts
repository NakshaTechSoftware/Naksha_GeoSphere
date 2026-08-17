import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cleanFolderName, namesMatch } from '../_folder-match';

// Remote MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

export async function GET(request: NextRequest) {
  try {
    const district = request.nextUrl.searchParams.get('district');
    const state = request.nextUrl.searchParams.get('state');

    if (!district || !state) {
      return NextResponse.json(
        { error: 'Both district and state parameters are required' },
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

    // Gram panchayat data lives under "Gram Panchayat Boundaries/India/<State>/Districts/",
    // with one folder per district holding that district's taluk boundary file.
    //
    // Find the state folder first: the GeoJSON's stname property (e.g. "KARNATAKA") doesn't
    // always match the MinIO folder's casing ("Karnataka"), so match case-insensitively
    // (see _folder-match.ts).
    const indiaListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Gram Panchayat Boundaries/India/',
      Delimiter: '/',
    });

    const indiaListResponse = await s3Client.send(indiaListCommand);

    const stateFolder = indiaListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      return namesMatch(cleanFolderName(folderName), state);
    });

    if (!stateFolder) {
      return NextResponse.json(
        { error: `Gram panchayat data not found for state "${state}"` },
        { status: 404 }
      );
    }

    const statePrefix = `${stateFolder.Prefix}Districts/`;

    // List the district folders to find the one matching the clicked district name
    // (folder names tolerate transliteration differences like "Kalaburgi" vs "Kalaburagi"
    // or "Bengaluru (Rural)" vs "Bengaluru Rural" - see _folder-match.ts).
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: statePrefix,
      Delimiter: '/',
    });

    const listResponse = await s3Client.send(listCommand);

    const districtFolder = listResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      return namesMatch(cleanFolderName(folderName), district);
    });

    if (!districtFolder) {
      return NextResponse.json(
        { error: `Gram panchayat district folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    // List the district folder's direct children (delimiter '/' skips the nested
    // Taluk_Panchayats/ tree) and pick the taluk boundaries file.
    const districtPrefix = districtFolder.Prefix || '';
    const districtFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: districtPrefix,
      Delimiter: '/',
    });

    const districtFilesResponse = await s3Client.send(districtFilesCommand);

    const talukFile = districtFilesResponse.Contents?.find((file) => {
      const fileName = file.Key || '';
      return fileName.includes('_taluk_boundaries') && fileName.endsWith('.geojson');
    });

    if (!talukFile || !talukFile.Key) {
      return NextResponse.json(
        { error: `No gram panchayat taluk boundaries file found for district "${district}"` },
        { status: 404 }
      );
    }

    // Fetch the taluk boundaries GeoJSON file
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: talukFile.Key,
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
      console.error(`Failed to fetch gram panchayat taluk geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
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
    console.error('Error fetching gram panchayat taluk boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load gram panchayat taluk boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
