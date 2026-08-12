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
  const district = request.nextUrl.searchParams.get('district');
  const state = request.nextUrl.searchParams.get('state');
  const taluk = request.nextUrl.searchParams.get('taluk');

  console.log(`\n\n[taluk-hoblies] ========================================`);
  console.log(`[taluk-hoblies] NEW REQUEST RECEIVED`);
  console.log(`[taluk-hoblies] Params: taluk="${taluk}", district="${district}", state="${state}"`);
  console.log(`[taluk-hoblies] ========================================\n`);

  try {
    if (!district || !state || !taluk) {
      return NextResponse.json(
        { error: 'district, state, and taluk parameters are all required' },
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

    // Find the district folder, e.g. "Administrative Boundaries/india/karnataka/Districts/17_Chikkamagaluru/"
    // (the numbered district folders live under the state's Districts/ subfolder).
    const statePrefix = `Administrative Boundaries/india/${normalizedState}/Districts/`;
    const stateListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: statePrefix,
      Delimiter: '/',
    });
    const stateListResponse = await s3Client.send(stateListCommand);

    console.log(`[taluk-hoblies] === REQUEST START ===`);
    console.log(`[taluk-hoblies] Received request: taluk="${taluk}", district="${district}", state="${state}"`);
    console.log(`[taluk-hoblies] Searching for district="${district}" in state="${normalizedState}"`);
    console.log(`[taluk-hoblies] Available district folders:`, stateListResponse.CommonPrefixes?.map(p => p.Prefix));
    const districtFolder = stateListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      const match = namesMatch(cleaned, district);
      console.log(`[taluk-hoblies] District check: "${folderName}" -> cleaned="${cleaned}" vs "${district}" -> ${match}`);
      return match;
    });

    if (!districtFolder?.Prefix) {
      return NextResponse.json(
        { error: `District folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    // Find the taluk subfolder under SubDistricts/ or Sub_Districts/
    // Try both naming conventions
    let subDistrictsPrefix = `${districtFolder.Prefix}SubDistricts/`;
    let talukListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: subDistrictsPrefix,
      Delimiter: '/',
    });
    let talukListResponse = await s3Client.send(talukListCommand);

    // If no results with "SubDistricts/", try "Sub_Districts/"
    if (!talukListResponse.CommonPrefixes || talukListResponse.CommonPrefixes.length === 0) {
      subDistrictsPrefix = `${districtFolder.Prefix}Sub_Districts/`;
      talukListCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: subDistrictsPrefix,
        Delimiter: '/',
      });
      talukListResponse = await s3Client.send(talukListCommand);
    }

    console.log(`[taluk-hoblies] District folder found: "${districtFolder.Prefix}"`);
    console.log(`[taluk-hoblies] Looking for taluk="${taluk}" in SubDistricts folders...`);
    console.log(`[taluk-hoblies] Available taluk folders:`, talukListResponse.CommonPrefixes?.map(p => p.Prefix));
    
    // No hotfix needed - the property name "Bangalore-South" should match correctly
    let searchTalukName = taluk;
    
    // First pass: try exact fuzzy matching
    let talukFolder = talukListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      const cleaned = cleanFolderName(folderName);
      const match = namesMatch(cleaned, searchTalukName);
      console.log(`[taluk-hoblies] Taluk folder check (pass 1 - exact): "${folderName}" -> cleaned="${cleaned}" vs "${searchTalukName}" -> match=${match}`);
      return match;
    });
    
    // Second pass: if no match found, try matching the last part of folder name with taluk name
    // This handles cases like "2002_Bangalore-South" matching "Bangalore South"
    if (!talukFolder) {
      console.log(`[taluk-hoblies] No exact match found, trying partial matching...`);
      talukFolder = talukListResponse.CommonPrefixes?.find((prefix) => {
        const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
        const cleaned = cleanFolderName(folderName);
        const talukCleaned = searchTalukName.trim().toLowerCase().replace(/[_-]/g, ' ');
        
        // Check if the folder name contains the taluk name or vice versa
        const containsMatch = cleaned.includes(talukCleaned) || talukCleaned.includes(cleaned);
        
        // Also check if just the last word matches (e.g., "South" in "Bangalore South")
        const talukLastWord = talukCleaned.split(' ').pop() || '';
        const folderLastWord = cleaned.split(' ').pop() || '';
        const lastWordMatch = talukLastWord === folderLastWord && talukLastWord.length > 3;
        
        const match = containsMatch || lastWordMatch;
        console.log(`[taluk-hoblies] Taluk folder check (pass 2 - partial): "${folderName}" -> cleaned="${cleaned}" vs "${searchTalukName}" (talukCleaned="${talukCleaned}") -> containsMatch=${containsMatch}, lastWordMatch=${lastWordMatch}, match=${match}`);
        return match;
      });
    }

    if (!talukFolder?.Prefix) {
      return NextResponse.json(
        { error: `Taluk folder not found for "${taluk}" in district "${district}". Checked both SubDistricts/ and Sub_Districts/ folders.` },
        { status: 404 }
      );
    }

    // Hobli boundaries live inside the taluk's Hoblis/<hobli>/ subfolders (each hobli
    // folder holds its own <hobli>_hobli_boundary.geojson). List the hobli subfolders
    // first, then collect every *_hobli_boundary.geojson and merge them into one
    // FeatureCollection for the frontend.
    const hoblisPrefix = `${talukFolder.Prefix}Hoblis/`;
    const hoblisListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: hoblisPrefix,
      Delimiter: '/',
    });
    const hoblisListResponse = await s3Client.send(hoblisListCommand);
    const hobliFolders = hoblisListResponse.CommonPrefixes?.map(p => p.Prefix) || [];

    console.log(`[taluk-hoblies] Taluk folder found: "${talukFolder.Prefix}"`);
    console.log(`[taluk-hoblies] Hobli subfolders:`, hobliFolders);

    if (hobliFolders.length === 0) {
      return NextResponse.json(
        { error: `No hobli boundaries file found for taluk "${taluk}"` },
        { status: 404 }
      );
    }

    // Fetch and merge every hobli boundary geojson into a single FeatureCollection.
    const allFeatures: any[] = [];
    let hobliCount = 0;
    for (const folder of hobliFolders) {
      const hobliFilesCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: folder,
        Delimiter: '/',
      });
      const hobliFilesResponse = await s3Client.send(hobliFilesCommand);
      const hobliFile = hobliFilesResponse.Contents?.find((file) => {
        const fileName = (file.Key || '').toLowerCase();
        return fileName.includes('hobli_boundary') && fileName.endsWith('.geojson');
      });

      if (!hobliFile?.Key) continue;

      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: hobliFile.Key,
      });
      const presignedUrl = await getSignedUrl(s3Client, getCommand, {
        expiresIn: 3600,
      });
      const fileResponse = await fetch(presignedUrl, { cache: 'no-store' });
      if (!fileResponse.ok) continue;

      try {
        const parsed = JSON.parse(await fileResponse.text());
        if (parsed && Array.isArray(parsed.features)) {
          allFeatures.push(...parsed.features);
          hobliCount++;
        }
      } catch (e) {
        console.warn(`[taluk-hoblies] Failed to parse hobli file "${hobliFile.Key}":`, e);
      }
    }

    if (allFeatures.length === 0) {
      return NextResponse.json(
        { error: `No hobli boundaries file found for taluk "${taluk}"` },
        { status: 404 }
      );
    }

    const merged: { type: 'FeatureCollection'; features: any[] } = {
      type: 'FeatureCollection',
      features: allFeatures,
    };
    console.log(`[taluk-hoblies] SUCCESS: Merged ${hobliCount} hobli files into ${allFeatures.length} features`);

    return NextResponse.json(merged, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching taluk hobli boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load hobli boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
