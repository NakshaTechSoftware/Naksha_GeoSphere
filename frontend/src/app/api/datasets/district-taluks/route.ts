import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
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

    // Normalize state and district names for path matching
    const normalizedState = state.trim().toLowerCase();
    const normalizedDistrict = district.trim().toLowerCase().replace(/\s+/g, '_');

    // List all files in the state's directory to find the district folder
    const statePrefix = `india/${normalizedState}/`;
    
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: statePrefix,
      Delimiter: '/',
    });

    const listResponse = await s3Client.send(listCommand);
    
    // Find the district folder (it may have a prefix like "17-Chikkamagaluru" or "17_Chikkamagaluru")
    // Match by checking if the folder name contains the district name (case-insensitive)
    const districtFolder = listResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      // Remove numbers and separators, then compare
      const cleanFolderName = folderName.replace(/^\d+[-_]/, '').toLowerCase().replace(/[-_]/g, ' ');
      const cleanDistrictName = district.toLowerCase().replace(/[-_]/g, ' ');
      return cleanFolderName === cleanDistrictName || 
             cleanFolderName.includes(cleanDistrictName) ||
             cleanDistrictName.includes(cleanFolderName);
    });

    if (!districtFolder) {
      return NextResponse.json(
        { error: `District folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    // List files in the district folder to find the subdistrict_boundaries file
    const districtPrefix = districtFolder.Prefix || '';
    const districtFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: districtPrefix,
    });

    const districtFilesResponse = await s3Client.send(districtFilesCommand);
    
    // Find the file containing "subdistrict_boundary" or "subdistrict_boundaries" in its name
    const talukFile = districtFilesResponse.Contents?.find((file) => {
      const fileName = file.Key || '';
      return (fileName.includes('subdistrict_boundary') || fileName.includes('subdistrict_boundaries')) && fileName.endsWith('.geojson');
    });

    if (!talukFile || !talukFile.Key) {
      return NextResponse.json(
        { error: `No subdistrict boundaries file found for district "${district}"` },
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
    });

    if (!fileResponse.ok) {
      console.error(`Failed to fetch taluk geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = await fileResponse.text();

    return new NextResponse(geojson, {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching district taluk boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load taluk boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
