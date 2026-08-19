import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cleanFolderName, namesEqual, namesMatch } from '../_folder-match';

// Remote MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get('district');
  const state = request.nextUrl.searchParams.get('state');
  const taluk = request.nextUrl.searchParams.get('taluk');
  const hobli = request.nextUrl.searchParams.get('hobli');

  console.log(`\n\n[hobli-villages] ========================================`);
  console.log(`[hobli-villages] NEW REQUEST RECEIVED`);
  console.log(`[hobli-villages] Params: hobli="${hobli}", taluk="${taluk}", district="${district}", state="${state}"`);
  console.log(`[hobli-villages] ========================================\n`);

  try {
    if (!district || !state || !taluk || !hobli) {
      return NextResponse.json(
        { error: 'district, state, taluk, and hobli parameters are all required' },
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

    const normalizedState = state.trim().toLowerCase();

    // Find the district folder (the numbered district folders live under the state's
    // Districts/ subfolder).
    const statePrefix = `Administrative Boundaries/india/${normalizedState}/Districts/`;
    const stateListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: statePrefix,
      Delimiter: '/',
    });
    const stateListResponse = await s3Client.send(stateListCommand);

    console.log(`[hobli-villages] Searching for district="${district}" in state="${normalizedState}"`);
    console.log(`[hobli-villages] Available district folders:`, stateListResponse.CommonPrefixes?.map(p => p.Prefix));
    
    const districtFolder = stateListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      const match = namesMatch(cleaned, district);
      console.log(`[hobli-villages] District check: "${folderName}" -> cleaned="${cleaned}" vs "${district}" -> ${match}`);
      return match;
    });

    if (!districtFolder?.Prefix) {
      return NextResponse.json(
        { error: `District folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    // Find the taluk subfolder
    let subDistrictsPrefix = `${districtFolder.Prefix}SubDistricts/`;
    let talukListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: subDistrictsPrefix,
      Delimiter: '/',
    });
    let talukListResponse = await s3Client.send(talukListCommand);

    if (!talukListResponse.CommonPrefixes || talukListResponse.CommonPrefixes.length === 0) {
      subDistrictsPrefix = `${districtFolder.Prefix}Sub_Districts/`;
      talukListCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: subDistrictsPrefix,
        Delimiter: '/',
      });
      talukListResponse = await s3Client.send(talukListCommand);
    }

    console.log(`[hobli-villages] Looking for taluk="${taluk}"`);
    console.log(`[hobli-villages] Available taluk folders:`, talukListResponse.CommonPrefixes?.map(p => p.Prefix));
    
    const talukFolder = talukListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      const match = namesMatch(cleaned, taluk);
      console.log(`[hobli-villages] Taluk check: "${folderName}" -> cleaned="${cleaned}" vs "${taluk}" -> ${match}`);
      return match;
    });

    if (!talukFolder?.Prefix) {
      return NextResponse.json(
        { error: `Taluk folder not found for "${taluk}" in district "${district}"` },
        { status: 404 }
      );
    }

    // Find the Hoblis folder and then the hobli subfolder
    // Try multiple variants: "Hoblis", "Hoblies", "hoblies", "hoblis"
    let hobliesPrefix = `${talukFolder.Prefix}Hoblis/`;
    console.log(`[hobli-villages] ✓ Taluk folder: "${talukFolder.Prefix}"`);
    console.log(`[hobli-villages] Looking for hobli="${hobli}" in Hoblis prefix="${hobliesPrefix}"`);
    
    let hobliListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: hobliesPrefix,
      Delimiter: '/',
    });
    let hobliListResponse = await s3Client.send(hobliListCommand);
    
    // Try different folder name variants
    const folderVariants = ['Hoblies/', 'hoblies/', 'hoblis/'];
    for (const variant of folderVariants) {
      if (!hobliListResponse.CommonPrefixes || hobliListResponse.CommonPrefixes.length === 0) {
        console.log(`[hobli-villages] No folders found, trying "${variant}"`);
        hobliesPrefix = `${talukFolder.Prefix}${variant}`;
        hobliListCommand = new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: hobliesPrefix,
          Delimiter: '/',
        });
        hobliListResponse = await s3Client.send(hobliListCommand);
      }
    }
    
    // If still no folders, try checking what folders actually exist in taluk
    if (!hobliListResponse.CommonPrefixes || hobliListResponse.CommonPrefixes.length === 0) {
      console.log(`[hobli-villages] No hobli folders found. Checking what folders exist in taluk...`);
      const talukContentsCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: talukFolder.Prefix,
        Delimiter: '/',
      });
      const talukContents = await s3Client.send(talukContentsCommand);
      console.log(`[hobli-villages] Available folders in taluk:`, talukContents.CommonPrefixes?.map(p => p.Prefix));
    }
    
    console.log(`[hobli-villages] Hobli list response - IsTruncated: ${hobliListResponse.IsTruncated}, KeyCount: ${hobliListResponse.KeyCount}`);
    console.log(`[hobli-villages] Available hobli folders:`, hobliListResponse.CommonPrefixes?.map(p => p.Prefix));
    console.log(`[hobli-villages] Contents (if any):`, hobliListResponse.Contents?.map(c => c.Key));
    
    if (!hobliListResponse.CommonPrefixes || hobliListResponse.CommonPrefixes.length === 0) {
      console.log(`[hobli-villages] ERROR: No hobli folders found in "${hobliesPrefix}"`);
      return NextResponse.json(
        { error: `Hoblies folder not found or empty for taluk "${taluk}"` },
        { status: 404 }
      );
    }
    
    const hobliCandidates = hobliListResponse.CommonPrefixes.map((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      return { prefix, folderName, cleaned };
    });

    // Suffixes distinguish real Bengaluru Urban hoblis. Previously namesMatch
    // considered "Kasaba" a match for "Kasaba-1", and Array.find selected the
    // first MinIO folder. Prefer exact identity; accept a fuzzy legacy match
    // only when it resolves to exactly one sibling.
    const exactHobli = hobliCandidates.find(({ cleaned }) => namesEqual(cleaned, hobli));
    const fuzzyHoblis = exactHobli
      ? []
      : hobliCandidates.filter(({ cleaned }) => namesMatch(cleaned, hobli));
    const hobliFolder = exactHobli?.prefix ?? (fuzzyHoblis.length === 1 ? fuzzyHoblis[0]?.prefix : undefined);

    if (!hobliFolder?.Prefix) {
      return NextResponse.json(
        { error: `Hobli folder not found for "${hobli}" in taluk "${taluk}"` },
        { status: 404 }
      );
    }

    console.log(`[hobli-villages] ✓ Matched hobli folder: "${hobliFolder.Prefix}"`);

    // Find the village boundary geojson file inside the hobli folder. Delimiter '/'
    // lists only direct children - the village geojson sits at the hobli folder root,
    // so this skips the deeply-nested cadastral files under Villages/ that made the
    // recursive listing slow.
    const hobliFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: hobliFolder.Prefix,
      Delimiter: '/',
    });
    const hobliFilesResponse = await s3Client.send(hobliFilesCommand);

    console.log(`[hobli-villages] Files in hobli folder:`, hobliFilesResponse.Contents?.map(c => c.Key));
    
    const villageFile = hobliFilesResponse.Contents?.find((file) => {
      const fileName = (file.Key || '').toLowerCase();
      const isVillageFile = (fileName.includes('village') || fileName.includes('villages')) && fileName.endsWith('.geojson');
      console.log(`[hobli-villages] File check: "${file.Key}" -> contains 'village(s)'=${fileName.includes('village') || fileName.includes('villages')}, ends with '.geojson'=${fileName.endsWith('.geojson')} -> match=${isVillageFile}`);
      return isVillageFile;
    });

    if (!villageFile?.Key) {
      return NextResponse.json(
        { error: `No village boundaries file found for hobli "${hobli}"` },
        { status: 404 }
      );
    }

    console.log(`[hobli-villages] ✓✓✓ FINAL SELECTION: Will load village file "${villageFile.Key}"`);

    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: villageFile.Key,
    });

    const presignedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 3600,
    });

    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
    });

    if (!fileResponse.ok) {
      console.error(`Failed to fetch village geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = await fileResponse.text();
    console.log(`[hobli-villages] SUCCESS: Returning village file "${villageFile.Key}" (${geojson.length} bytes)`);

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
    console.error('Error fetching hobli village boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load village boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
