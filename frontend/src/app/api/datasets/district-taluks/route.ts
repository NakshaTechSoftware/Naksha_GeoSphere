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

    console.log(`\n\n[district-taluks] ========================================`);
    console.log(`[district-taluks] NEW REQUEST RECEIVED`);
    console.log(`[district-taluks] Params: district="${district}", state="${state}"`);
    console.log(`[district-taluks] ========================================\n`);

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

    // Normalize state name for path matching
    const normalizedState = state.trim().toLowerCase();

    // List the district folders under the state's Districts/ subfolder (the 31 numbered
    // district folders were moved there from the state root).
    const statePrefix = `Administrative Boundaries/india/${normalizedState}/Districts/`;
    
    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: statePrefix,
      Delimiter: '/',
    });

    const listResponse = await s3Client.send(listCommand);
    
    console.log(`[district-taluks] Searching for district="${district}" in state="${normalizedState}"`);
    console.log(`[district-taluks] State prefix="${statePrefix}"`);
    console.log(`[district-taluks] Available district folders:`, listResponse.CommonPrefixes?.map(p => p.Prefix));
    
    // Find the district folder (it may have a prefix like "17-Chikkamagaluru" or "17_Chikkamagaluru").
    // Match by name, tolerating minor transliteration differences (e.g. "Kalaburagi" vs
    // the MinIO folder's "Kalaburgi") - see _folder-match.ts.
    const districtFolder = listResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      const match = namesMatch(cleaned, district);
      console.log(`[district-taluks] District check: "${folderName}" -> cleaned="${cleaned}" vs "${district}" -> ${match}`);
      return match;
    });

    if (!districtFolder) {
      console.log(`[district-taluks] ERROR: District folder NOT FOUND for "${district}" in state "${state}"`);
      return NextResponse.json(
        { error: `District folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    console.log(`[district-taluks] ✓ Matched district folder: "${districtFolder.Prefix}"`);

    // List files in the district folder to find the subdistrict_boundaries file.
    // Delimiter '/' lists only the district folder's direct children - the taluk geojson
    // sits at the root, so this skips the (now thousands of) deeply-nested cadastral
    // files under Villages/ that made the recursive listing take ~10s.
    const districtPrefix = districtFolder.Prefix || '';
    const districtFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: districtPrefix,
      Delimiter: '/',
    });

    const districtFilesResponse = await s3Client.send(districtFilesCommand);
    
    console.log(`[district-taluks] Files in district folder:`, districtFilesResponse.Contents?.map(c => c.Key));
    
    // Find the file containing "subdistrict_boundary" or "subdistrict_boundaries" in its name
    const talukFile = districtFilesResponse.Contents?.find((file) => {
      const fileName = file.Key || '';
      const isMatch = (fileName.includes('subdistrict_boundary') || fileName.includes('subdistrict_boundaries')) && fileName.endsWith('.geojson');
      console.log(`[district-taluks] File check: "${fileName}" -> match=${isMatch}`);
      return isMatch;
    });

    if (!talukFile || !talukFile.Key) {
      console.log(`[district-taluks] ERROR: No subdistrict boundaries file found for district "${district}"`);
      return NextResponse.json(
        { error: `No subdistrict boundaries file found for district "${district}"` },
        { status: 404 }
      );
    }

    console.log(`[district-taluks] ✓✓✓ FINAL SELECTION: Will load taluk file "${talukFile.Key}"`);

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
    
    console.log(`[district-taluks] SUCCESS: Returning taluk file "${talukFile.Key}" (${geojson.length} bytes)`);

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
    console.error('Error fetching district taluk boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load taluk boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
