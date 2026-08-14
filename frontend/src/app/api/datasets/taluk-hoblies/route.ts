import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { featureCollection, union } from '@turf/turf';
import { NextRequest, NextResponse } from 'next/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { cleanFolderName, namesMatch } from '../_folder-match';

// Dissolving a taluk's hobli boundaries (S3 round-trips per hobli + turf union over every
// village polygon) is the slowest step in the drill-down, and the client cache-busts its
// requests, so without caching every taluk click recomputes it. The underlying boundaries
// are static, so cache the dissolved result per taluk: in-memory (fast within a process)
// plus on disk under frontend/.cache (survives dev-server restarts).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const memCache = new Map<string, { data: GeoJSON.FeatureCollection; ts: number }>();

function cacheKey(state: string, district: string, taluk: string) {
  return `${state.trim().toLowerCase()}|${district.trim().toLowerCase()}|${taluk.trim().toLowerCase()}`;
}

function diskCachePath(key: string) {
  // '|' separates the cache-key parts but is invalid in Windows filenames, so drop all
  // non-alphanumerics (e.g. "karnataka|chikkamagaluru|tarikere" -> "karnataka_...").
  const safe = key.replace(/[^a-z0-9]+/g, '_');
  return join(process.cwd(), '.cache', 'taluk-hoblies', `${safe}.json`);
}

function readDiskCache(path: string): GeoJSON.FeatureCollection | null {
  try {
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8')) as GeoJSON.FeatureCollection;
    return data?.features?.length ? data : null;
  } catch (e) {
    console.warn('[taluk-hoblies] failed to read disk cache:', e);
    return null;
  }
}

function writeDiskCache(path: string, data: GeoJSON.FeatureCollection) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  } catch (e) {
    console.warn('[taluk-hoblies] failed to write disk cache:', e);
  }
}

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

    // Serve the cached result when available (in-memory, then disk) - the dissolved
    // boundaries are static, so a cache hit makes repeated taluk clicks instant.
    const key = cacheKey(state, district, taluk);
    const mem = memCache.get(key);
    if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
      return NextResponse.json(mem.data, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }
    const diskPath = diskCachePath(key);
    const diskCached = readDiskCache(diskPath);
    if (diskCached) {
      memCache.set(key, { data: diskCached, ts: Date.now() });
      return NextResponse.json(diskCached, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
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

    const result: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
    writeDiskCache(diskPath, result);
    memCache.set(key, { data: result, ts: Date.now() });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    console.error('[taluk-hoblies] Failed to load hobli boundaries:', error);
    return NextResponse.json({ error: 'Failed to load hobli boundaries' }, { status: 500 });
  }
}
