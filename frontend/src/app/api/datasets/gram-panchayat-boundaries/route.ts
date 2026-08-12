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

// ---------------------------------------------------------------------------
// Village-count helpers. The KGIS village hierarchy stores one village boundary
// file per hobli, and every village feature carries LGDGPCode (the LGD code of
// the gram panchayat it belongs to). The per-gram-panchayat boundary files (under
// each hobli's Gram_Panchayats/ folder) carry the matching code in KGISGP_DeptCode,
// so we can count villages per GP exactly, with a geometry fallback for the few
// villages whose source file lacks LGDGPCode.
// ---------------------------------------------------------------------------

// Normalized GP name used to join per-GP files to the merged GP boundary features.
const normGpName = (s: string): string =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchGeojson(
  s3Client: S3Client,
  key: string
): Promise<any | null> {
  try {
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 }
    );
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function listDirect(s3Client: S3Client, prefix: string) {
  return s3Client.send(
    new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      Delimiter: '/',
    })
  );
}

// Ray-casting point-in-polygon (handles Polygon and MultiPolygon, respects holes).
function pointInPolygon(pt: [number, number], coords: any): boolean {
  const polys: any[] =
    coords[0] && Array.isArray(coords[0][0]) && Array.isArray(coords[0][0][0])
      ? coords
      : [coords];
  const [x, y] = pt;
  for (const poly of polys) {
    let inOuter = false;
    let inHole = false;
    poly.forEach((ring: any[], idx: number) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i] as [number, number];
        const [xj, yj] = ring[j] as [number, number];
        const intersects =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
      }
      if (idx === 0) inOuter = inOuter || inside;
      else if (inside) inHole = true;
    });
    if (inOuter && !inHole) return true;
  }
  return false;
}

// Bounding-box centre of a geometry - a cheap representative point.
function geometryCenter(geom: any): [number, number] {
  const rings: any[][] =
    geom.type === 'MultiPolygon'
      ? geom.coordinates.flatMap((p: any) => p)
      : geom.coordinates;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  (rings[0] as any[]).forEach((pt) => {
    const [x, y] = pt as [number, number];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

async function findAdminFolder(
  s3Client: S3Client,
  parentPrefix: string,
  displayName: string
) {
  const list = await listDirect(s3Client, parentPrefix);
  return list.CommonPrefixes?.find((prefix) => {
    const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
    return namesMatch(cleanFolderName(folderName), displayName);
  });
}

// Adds a "no_of_villages" property to every GP feature in the merged boundaries
// GeoJSON. Returns the enriched GeoJSON, or the input unchanged if the village
// hierarchy can't be resolved (so the layer still renders).
async function addVillageCounts(
  s3Client: S3Client,
  geojson: any,
  state: string,
  district: string,
  taluk: string
): Promise<any> {
  if (!geojson?.features?.length) return geojson;

  // Resolve state/district/taluk folders under the Administrative Boundaries
  // tree (mirrors the hobli-villages route: lowercase "india", numbered folders
  // tolerated, SubDistricts/Sub_Districts and Hoblis/Hoblies variants).
  let stateFolder = await findAdminFolder(
    s3Client,
    'Administrative Boundaries/india/',
    state
  );
  if (!stateFolder) {
    stateFolder = await findAdminFolder(
      s3Client,
      'Administrative Boundaries/India/',
      state
    );
  }
  if (!stateFolder) return geojson;

  const districtFolder = await findAdminFolder(
    s3Client,
    `${stateFolder.Prefix}Districts/`,
    district
  );
  if (!districtFolder) return geojson;

  let talukFolder = await findAdminFolder(
    s3Client,
    `${districtFolder.Prefix}SubDistricts/`,
    taluk
  );
  if (!talukFolder) {
    talukFolder = await findAdminFolder(
      s3Client,
      `${districtFolder.Prefix}Sub_Districts/`,
      taluk
    );
  }
  if (!talukFolder) return geojson;

  let hobliList = await listDirect(
    s3Client,
    `${talukFolder.Prefix}Hoblis/`
  );
  if (!hobliList.CommonPrefixes?.length) {
    hobliList = await listDirect(
      s3Client,
      `${talukFolder.Prefix}Hoblies/`
    );
  }
  const hobliNames = (hobliList.CommonPrefixes || []).map((p) =>
    (p.Prefix || '').split('/').slice(-2)[0]
  );
  if (!hobliNames.length) return geojson;

  // Collect the per-GP boundary files and the hobli village boundary files.
  const gpFileKeys: string[] = [];
  const villageFileKeys: string[] = [];
  for (const hobli of hobliNames) {
    const hobliPrefix = `${talukFolder.Prefix}Hoblis/${hobli}/`;
    const gpList = await listDirect(s3Client, `${hobliPrefix}Gram_Panchayats/`);
    (gpList.Contents || []).forEach((c) => {
      if (c.Key && c.Key.endsWith('.geojson')) gpFileKeys.push(c.Key);
    });
    const hobliFiles = await listDirect(s3Client, hobliPrefix);
    const villageFile = (hobliFiles.Contents || []).find((c) => {
      const name = (c.Key || '').toLowerCase();
      return name.includes('village') && name.endsWith('.geojson');
    });
    if (villageFile?.Key) villageFileKeys.push(villageFile.Key);
  }

  if (!villageFileKeys.length) return geojson;

  const [gpGeojsons, villageGeojsons] = await Promise.all([
    Promise.all(gpFileKeys.map((k) => fetchGeojson(s3Client, k))),
    Promise.all(villageFileKeys.map((k) => fetchGeojson(s3Client, k))),
  ]);

  // LGD GP code -> GP name, from the per-GP files. Also keep each GP's polygon
  // for the geometric fallback.
  const gpNameByCode = new Map<string, string>();
  const gpPolygons: { name: string; geom: any; center: [number, number] }[] = [];
  gpGeojsons.forEach((gj) => {
    const f = gj?.features?.[0];
    if (!f?.properties) return;
    const code = String(f.properties.KGISGP_DeptCode || '').trim();
    const name = String(f.properties.KGISGPName || '').trim();
    if (code && name) gpNameByCode.set(code, name);
    if (name && f.geometry) {
      gpPolygons.push({ name, geom: f.geometry, center: geometryCenter(f.geometry) });
    }
  });

  // Count villages per GP: exact LGD code match first, then (for villages whose
  // file lacks LGDGPCode) centroid containment / nearest-GP fallback.
  const countsByName = new Map<string, number>();
  villageGeojsons
    .filter((gj) => gj?.features)
    .flatMap((gj) => gj.features)
    .forEach((f: any) => {
      const code = String(f.properties?.LGDGPCode || '').trim();
      const gpName = code ? gpNameByCode.get(code) : undefined;
      if (gpName) {
        countsByName.set(gpName, (countsByName.get(gpName) || 0) + 1);
        return;
      }
      if (!f.geometry || !gpPolygons.length) return;
      const c = geometryCenter(f.geometry);
      let best: (typeof gpPolygons)[number] | undefined;
      let bestDist = Infinity;
      for (const g of gpPolygons) {
        if (pointInPolygon(c, g.geom.coordinates)) {
          best = g;
          break;
        }
        const d = Math.hypot(c[0] - g.center[0], c[1] - g.center[1]);
        if (d < bestDist) {
          bestDist = d;
          best = g;
        }
      }
      if (best) countsByName.set(best.name, (countsByName.get(best.name) || 0) + 1);
    });

  // Attach the count to the merged features (normalized-name match, with a fuzzy
  // fallback for transliteration differences).
  geojson.features.forEach((f: any) => {
    if (!f?.properties) return;
    const mergedName = String(f.properties.gram_panchayat || '').trim();
    if (!mergedName) return;
    const direct = countsByName.get(mergedName);
    if (direct !== undefined) {
      f.properties.no_of_villages = direct;
      return;
    }
    const norm = normGpName(mergedName);
    const fuzzy = [...countsByName.entries()].find(
      ([name]) => normGpName(name) === norm
    );
    if (fuzzy) f.properties.no_of_villages = fuzzy[1];
  });

  return geojson;
}

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

    let geojson: any;
    try {
      geojson = JSON.parse(await fileResponse.text());
    } catch {
      return NextResponse.json(
        { error: 'Gram panchayat boundaries file is not valid JSON' },
        { status: 500 }
      );
    }

    // Attach an exact per-GP village count ("No. of Villages") computed from the
    // KGIS village hierarchy. If the village data isn't resolvable, serve the plain
    // boundaries - the layer still renders, just without the count attribute.
    try {
      geojson = await addVillageCounts(s3Client, geojson, state, district, taluk);
    } catch (err) {
      console.warn('Could not enrich GP boundaries with village counts:', err);
    }

    return NextResponse.json(geojson, {
      headers: {
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
