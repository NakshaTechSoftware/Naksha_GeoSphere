import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { featureCollection, union } from '@turf/turf';
import { NextRequest, NextResponse } from 'next/server';
import { cleanFolderName, namesMatch } from '../_folder-match';

const client = new S3Client({
  endpoint: 'http://192.168.10.81:9010',
  region: 'geosphere',
  credentials: {
    accessKeyId: 'geosphere_storage',
    secretAccessKey: '706f803f67c143c884305e7085b59210ffb29ac69e724a70',
  },
  forcePathStyle: true,
});
const BUCKET = 'geosphere-source-data';

async function listFolders(prefix: string) {
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, Delimiter: '/' })
  );
  return (response.CommonPrefixes ?? []).map((item) => item.Prefix ?? '').filter(Boolean);
}

function findFolder(folders: string[], name: string) {
  return folders.find((folder) =>
    namesMatch(cleanFolderName(folder.split('/').filter(Boolean).at(-1) ?? ''), name)
  );
}

async function readBoundary(folder: string) {
  const listing = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: folder, Delimiter: '/' })
  );
  const keys = listing.Contents?.map((item) => item.Key ?? '') ?? [];
  // Village boundary files cover the entire hobli, including disconnected pieces. Some
  // generated hobli files contain only their first polygon (e.g. Kasaba/Madeehalli), so
  // dissolve all villages to reconstruct the complete, click-aligned hobli boundary.
  const key = keys.find((item) => /village_boundary\.geojson$/i.test(item));
  if (!key) return null;
  const object = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const villages = JSON.parse(
    (await object.Body?.transformToString()) ?? '{}'
  ) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  const polygonFeatures = villages.features.filter(
    (feature) => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon'
  );
  if (polygonFeatures.length === 0) return null;

  const dissolved = union(featureCollection(polygonFeatures));
  if (!dissolved) return null;
  const firstProperties = polygonFeatures[0]?.properties ?? {};
  const folderName = folder.split('/').filter(Boolean).at(-1) ?? '';
  dissolved.properties = {
    ...firstProperties,
    KGISHobliName: firstProperties.KGISHobliName ?? folderName,
    hobli_name: firstProperties.KGISHobliName ?? folderName,
  };
  return featureCollection([dissolved]);
}

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get('district')?.trim();
  const state = request.nextUrl.searchParams.get('state')?.trim();
  const taluk = request.nextUrl.searchParams.get('taluk')?.trim();
  if (!district || !state || !taluk) {
    return NextResponse.json({ error: 'district, state, and taluk are required' }, { status: 400 });
  }

  try {
    const statePrefix = `Administrative Boundaries/india/${state.toLowerCase()}/Districts/`;
    const districtFolder = findFolder(await listFolders(statePrefix), district);
    if (!districtFolder) {
      return NextResponse.json({ error: `District folder not found for "${district}"` }, { status: 404 });
    }

    let talukFolders = await listFolders(`${districtFolder}SubDistricts/`);
    if (talukFolders.length === 0) talukFolders = await listFolders(`${districtFolder}Sub_Districts/`);
    const talukFolder = findFolder(talukFolders, taluk);
    if (!talukFolder) {
      return NextResponse.json({ error: `Taluk folder not found for "${taluk}"` }, { status: 404 });
    }

    let hobliFolders: string[] = [];
    for (const variant of ['Hoblis/', 'Hoblies/', 'hoblis/', 'hoblies/']) {
      hobliFolders = await listFolders(`${talukFolder}${variant}`);
      if (hobliFolders.length > 0) break;
    }
    const collections = await Promise.all(hobliFolders.map(readBoundary));
    const features = collections.flatMap((collection) => collection?.features ?? []);
    if (features.length === 0) {
      return NextResponse.json({ error: `No hobli boundaries found for taluk "${taluk}"` }, { status: 404 });
    }

    return NextResponse.json(
      { type: 'FeatureCollection', features },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error) {
    console.error('[taluk-hoblies] Failed to load hobli boundaries:', error);
    return NextResponse.json({ error: 'Failed to load hobli boundaries' }, { status: 500 });
  }
}
