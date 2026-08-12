import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cleanFolderName, namesMatch, similarity } from '../_folder-match';
import { pickCadastralFile } from '../_cadastral-files';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

// Folder-name variants different districts/taluks use for the same drill level, tried in
// order until one actually yields folders (e.g. "SubDistricts/" vs "Sub_Districts/").
const SUBDISTRICT_FOLDER_VARIANTS = ['SubDistricts/', 'Sub_Districts/'];
const HOBLIES_FOLDER_VARIANTS = ['Hoblis/', 'Hoblies/', 'hoblies/', 'hoblis/'];

// Lists the immediate subfolders of `prefix` (the trailing slash makes each CommonPrefix a
// folder path like ".../Kasaba/").
async function listSubfolders(s3: S3Client, prefix: string): Promise<string[]> {
  const response = await s3.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, Delimiter: '/' })
  );
  return (response.CommonPrefixes ?? [])
    .map((p) => p.Prefix ?? '')
    .filter((p) => p.length > 0);
}

// Lists the folders under `parentPrefix + variant` for each variant in order and returns the
// first variant that has any subfolders, together with those folders.
async function listFirstPopulatedVariant(
  s3: S3Client,
  parentPrefix: string,
  variants: string[]
): Promise<string[]> {
  for (const variant of variants) {
    const folders = await listSubfolders(s3, `${parentPrefix}${variant}`);
    if (folders.length > 0) return folders;
  }
  return [];
}

// Returns the folder whose cleaned name matches `displayName`. Numeric prefixes, separators,
// and minor transliteration differences are tolerated (see _folder-match.ts), so a folder
// like "17_Chikkamagaluru" resolves for the display name "Chikkamagaluru", and a prefixed
// folder like "230308_Kanakatte" resolves for "Kanakatte".
function findFolderByName(folders: string[], displayName: string): string | undefined {
  return folders.find((prefix) => {
    const folderName = prefix.split('/').slice(-2)[0] ?? '';
    return namesMatch(cleanFolderName(folderName), displayName);
  });
}

// Village names must not use the generic substring rule: names such as "Holalu" and
// "Intitholalu" legitimately coexist under one hobli. Prefer an exact normalized match;
// only accept a spelling-tolerance fallback when it is unique and very close.
function findVillageFolder(folders: string[], displayName: string): string | undefined {
  const target = cleanFolderName(displayName);
  const candidates = folders.map((prefix) => ({
    prefix,
    name: cleanFolderName(prefix.split('/').slice(-2)[0] ?? ''),
  }));
  const exact = candidates.find(({ name }) => name === target);
  if (exact) return exact.prefix;

  const close = candidates
    .map((candidate) => ({ ...candidate, score: similarity(candidate.name, target) }))
    .filter(({ score }) => score >= 0.92)
    .sort((a, b) => b.score - a.score);
  return close.length === 1 || (close[0] && close[1] && close[0].score > close[1].score)
    ? close[0]?.prefix
    : undefined;
}

function findVillageFolderByCode(folders: string[], villageCode: string): string | undefined {
  const code = villageCode.trim();
  if (!code) return undefined;
  return folders.find((prefix) => {
    const folderName = prefix.split('/').slice(-2)[0] ?? '';
    return folderName === code || folderName.startsWith(`${code}_`) || folderName.startsWith(`${code}-`);
  });
}

async function findLegacyVillageFolderByCode(
  s3: S3Client,
  folders: string[],
  villageCode: string
): Promise<string | undefined> {
  // Older uploads use a plain village-name folder. Inspect the cadastral metadata only
  // when no code-prefixed folder matched, which disambiguates duplicate village names.
  for (const folder of folders) {
    const files = await s3.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: folder })
    );
    const key = pickCadastralFile(
      (files.Contents ?? []).map((item) => item.Key ?? '').filter(Boolean)
    );
    if (!key) continue;
    const object = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const text = (await object.Body?.transformToString()) ?? '{}';
    const data = JSON.parse(text) as GeoJSON.FeatureCollection;
    const properties = data.features[0]?.properties ?? {};
    const storedCode = String(
      properties.KGISVillageCode ??
        properties._parent_village_code ??
        properties.UniqueVillageCode ??
        ''
    ).split('_')[0];
    if (storedCode === villageCode) return folder;
  }
  return undefined;
}

// Resolves the district → taluk → hobli → Villages/{village} → cadastral file chain, i.e.
//   .../Districts/17_Chikkamagaluru/SubDistricts/Chikkamagaluru/Hoblis/Kasaba/Villages/{village}/...
// Uploading a village subfolder (containing a cadastral .geojson) under the hobli's Villages/
// folder is all that's needed for the file to be found when that village is clicked.
export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  const district = request.nextUrl.searchParams.get('district');
  const taluk = request.nextUrl.searchParams.get('taluk');
  const hobli = request.nextUrl.searchParams.get('hobli');
  const village = request.nextUrl.searchParams.get('village');
  const villageCode = request.nextUrl.searchParams.get('villageCode');

  try {
    if (!state || !district || !taluk || !hobli || !village) {
      return NextResponse.json(
        { error: 'state, district, taluk, hobli, and village parameters are all required' },
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

    // 1. District folder: numbered district folders live under the state's Districts/.
    const statePrefix = `Administrative Boundaries/india/${normalizedState}/Districts/`;
    const districtFolder = findFolderByName(
      await listSubfolders(s3Client, statePrefix),
      district
    );
    if (!districtFolder) {
      return NextResponse.json(
        { error: `District folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }

    // 2. Taluk folder under SubDistricts/ (or Sub_Districts/).
    const talukFolder = findFolderByName(
      await listFirstPopulatedVariant(s3Client, districtFolder, SUBDISTRICT_FOLDER_VARIANTS),
      taluk
    );
    if (!talukFolder) {
      return NextResponse.json(
        { error: `Taluk folder not found for "${taluk}" in district "${district}"` },
        { status: 404 }
      );
    }

    // 3. Hobli folder under Hoblis/ (or Hoblies/hoblies/hoblis/).
    const hobliFolder = findFolderByName(
      await listFirstPopulatedVariant(s3Client, talukFolder, HOBLIES_FOLDER_VARIANTS),
      hobli
    );
    if (!hobliFolder) {
      return NextResponse.json(
        { error: `Hobli folder not found for "${hobli}" in taluk "${taluk}"` },
        { status: 404 }
      );
    }

    // 4. Villages/ subfolder inside the hobli folder (case-insensitive).
    const villagesFolder = (await listSubfolders(s3Client, hobliFolder)).find((p) =>
      /villages?\/$/i.test(p)
    );
    if (!villagesFolder) {
      return NextResponse.json(
        { error: `No Villages folder found for hobli "${hobli}"` },
        { status: 404 }
      );
    }

    // 5. The village folder under Villages/ (the user uploads cadastral data into a
    // village-named subfolder here, e.g. ".../Villages/Hiremagaluru/").
    const villageFolders = await listSubfolders(s3Client, villagesFolder);
    let villageFolder = villageCode
      ? findVillageFolderByCode(villageFolders, villageCode)
      : undefined;
    if (!villageFolder && villageCode) {
      const sameNameFolders = villageFolders.filter(
        (folder) => cleanFolderName(folder.split('/').slice(-2)[0] ?? '') === cleanFolderName(village)
      );
      villageFolder = await findLegacyVillageFolderByCode(s3Client, sameNameFolders, villageCode);
    }
    villageFolder ??= findVillageFolder(villageFolders, village);
    if (!villageFolder) {
      return NextResponse.json(
        { error: `Village folder not found for "${village}" in hobli "${hobli}"` },
        { status: 404 }
      );
    }

    // 6. The cadastral .geojson inside the village folder. Recursive listing (no delimiter)
    // so files nested in subfolders are found too. See pickCadastralFile for the matching
    // rules: an explicit "cadastral"/"parcel"/"survey"-named file wins, any .geojson works.
    const villageFilesResponse = await s3Client.send(
      new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: villageFolder })
    );
    const cadastralKey = pickCadastralFile(
      (villageFilesResponse.Contents ?? [])
        .map((c) => c.Key ?? '')
        .filter((key) => key.length > 0)
    );
    if (!cadastralKey) {
      return NextResponse.json(
        { error: `No cadastral boundaries (.geojson) file found for village "${village}"` },
        { status: 404 }
      );
    }

    console.log(
      `[village-cadastrals] Resolved chain: ${districtFolder} → ${talukFolder} → ${hobliFolder} → ${villagesFolder} → ${villageFolder}`
    );
    console.log(`[village-cadastrals] Loading cadastral file "${cadastralKey}"`);

    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: cadastralKey }),
      { expiresIn: 3600 }
    );

    const fileResponse = await fetch(presignedUrl, { cache: 'no-store' });
    if (!fileResponse.ok) {
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = await fileResponse.text();
    console.log(
      `[village-cadastrals] SUCCESS: "${cadastralKey}" (${geojson.length} bytes)`
    );

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
    console.error('Error fetching village cadastral boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load village cadastral boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
