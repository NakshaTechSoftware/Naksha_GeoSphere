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

    // Find the hobli boundary geojson file inside the taluk folder. Delimiter '/' lists
    // only direct children - the hobli geojson sits at the taluk folder root, so this
    // skips the deeply-nested cadastral files under Hoblis/*/Villages/ that made the
    // recursive listing slow.
    const talukFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: talukFolder.Prefix,
      Delimiter: '/',
    });
    const talukFilesResponse = await s3Client.send(talukFilesCommand);

    console.log(`[taluk-hoblies] Taluk folder found: "${talukFolder.Prefix}"`);
    console.log(`[taluk-hoblies] Files in taluk folder:`, talukFilesResponse.Contents?.map(c => c.Key));
    
    // Look for file with "hobli_boundary" pattern (e.g., Sakleshpura_hobli_boundary.geojson)
    const hobliFile = talukFilesResponse.Contents?.find((file) => {
      const fileName = (file.Key || '').toLowerCase();
      const isMatch = fileName.includes('hobli_boundary') && fileName.endsWith('.geojson');
      console.log(`[taluk-hoblies] Checking file: "${file.Key}" -> includes 'hobli_boundary': ${fileName.includes('hobli_boundary')}, ends with .geojson: ${fileName.endsWith('.geojson')} -> MATCH: ${isMatch}`);
      return isMatch;
    });

    if (!hobliFile?.Key) {
      return NextResponse.json(
        { error: `No hobli boundaries file found for taluk "${taluk}"` },
        { status: 404 }
      );
    }

    console.log(`[taluk-hoblies] ✓✓✓ FINAL SELECTION: Will load hobli file "${hobliFile.Key}"`);
    console.log(`[taluk-hoblies] ✓✓✓ Expected path for Bangalore South: india/karnataka/20_Bengaluru_(Urban)/SubDistricts/2002_Bangalore-South/Bangalore-South_hobli_boundary.geojson`);

    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: hobliFile.Key,
    });

    const presignedUrl = await getSignedUrl(s3Client, getCommand, {
      expiresIn: 3600,
    });

    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
    });

    if (!fileResponse.ok) {
      console.error(`Failed to fetch hobli geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = await fileResponse.text();
    console.log(`[taluk-hoblies] SUCCESS: Returning hobli file "${hobliFile.Key}" (${geojson.length} bytes)`);

    // Validate bounding box of returned GeoJSON
    try {
      const parsed = JSON.parse(geojson);
      if (parsed.features && parsed.features.length > 0) {
        let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
        const visitCoords = (coords: any[]) => {
          for (const c of coords) {
            if (Array.isArray(c[0])) { visitCoords(c); } else {
              minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
              minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
            }
          }
        };
        parsed.features.forEach((f: any) => f.geometry?.coordinates && visitCoords(f.geometry.coordinates));
        console.log(`[taluk-hoblies] BBOX: Lng[${minLng.toFixed(4)}, ${maxLng.toFixed(4)}] Lat[${minLat.toFixed(4)}, ${maxLat.toFixed(4)}]`);
        console.log(`[taluk-hoblies] Bangalore South should be approx: Lng[77.45-77.75] Lat[12.82-12.98]`);
        if (minLat > 12.98 || maxLat < 12.82) {
          console.warn(`[taluk-hoblies] WARNING: Coordinates look wrong for Bangalore South!`);
        }
      }
    } catch(e) { /* ignore parse errors */ }

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
