import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { booleanPointInPolygon, centroid } from '@turf/turf';
import { cleanFolderName, namesMatch } from '../_folder-match';

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

// Enriching every pincode with its taluk/hobli/gram panchayat requires fetching the
// district's taluk boundaries plus per-taluk GP and hobli files, so cache the enriched
// result per district and only recompute when it expires.
const enrichedCache = new Map<string, { data: string; ts: number }>();
const ENRICHED_CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchJson(s3Client: S3Client, key: string): Promise<unknown> {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  const response = await fetch(presignedUrl, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  });
  if (!response.ok) throw new Error(`MinIO returned ${response.status} for ${key}`);
  return response.json();
}

// Candidate [lng, lat] points for testing containment: the polygon centroid plus the first
// vertex of every ring. Some pincode polygons are oddly shaped (or their centroid lands in a
// gap between boundary files), so testing ring starts as well materially improves coverage.
function candidatePoints(feature: { geometry?: unknown }): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  try {
    const c = centroid(feature as never);
    const coords = c.geometry.coordinates as unknown[];
    const lng = typeof coords[0] === "number" ? coords[0] : NaN;
    const lat = typeof coords[1] === "number" ? coords[1] : NaN;
    if (Number.isFinite(lng) && Number.isFinite(lat)) points.push([lng, lat]);
  } catch {
    // ignore
  }

  const geometry = feature.geometry as
    | { type: "Polygon"; coordinates: unknown }
    | { type: "MultiPolygon"; coordinates: unknown }
    | undefined;
  if (geometry) {
    const rings: unknown[][] =
      geometry.type === "Polygon"
        ? [geometry.coordinates as unknown[]]
        : (geometry.coordinates as unknown[][][]).map((poly) => poly[0] ?? []);
    for (const ring of rings) {
      const first = ring[0] as unknown[] | undefined;
      if (Array.isArray(first) && typeof first[0] === "number" && typeof first[1] === "number") {
        points.push([first[0], first[1]]);
      }
    }
  }
  return points;
}

// Returns the first feature whose geometry contains any of the candidate points, or null.
function featureContainingPoints(
  features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>,
  points: Array<[number, number]>
): { properties?: Record<string, unknown> } | null {
  for (const [lng, lat] of points) {
    for (const feature of features) {
      if (!feature.geometry) continue;
      try {
        if (booleanPointInPolygon([lng, lat], feature.geometry as never)) return feature;
      } catch {
        // skip malformed geometries
      }
    }
  }
  return null;
}

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
      credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
      forcePathStyle: true,
    });

    // --- Resolve the civic amenities district folder (state + district) ---
    const indiaListCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: 'Civic Amenities/India/',
      Delimiter: '/',
    });
    const indiaListResponse = await s3Client.send(indiaListCommand);
    const stateFolder = indiaListResponse.CommonPrefixes?.find((prefix) => {
      const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
      return namesMatch(cleanFolderName(folderName), state);
    });
    if (!stateFolder?.Prefix) {
      return NextResponse.json(
        { error: `Civic amenities data not found for state "${state}"` },
        { status: 404 }
      );
    }
    const stateFolderName = stateFolder.Prefix.split('/').slice(-2)[0] || '';

    const statePrefix = `${stateFolder.Prefix}Districts/`;
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
    if (!districtFolder?.Prefix) {
      return NextResponse.json(
        { error: `Civic amenities district folder not found for "${district}" in state "${state}"` },
        { status: 404 }
      );
    }
    const districtFolderName = districtFolder.Prefix.split('/').slice(-2)[0] || '';

    // --- Find the pincode boundary file ---
    const districtFilesCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: districtFolder.Prefix,
      Delimiter: '/',
    });
    const districtFilesResponse = await s3Client.send(districtFilesCommand);
    const pincodeFile = districtFilesResponse.Contents?.find((file) => {
      const fileName = file.Key || '';
      return fileName.includes('_pincode_boundary') && fileName.endsWith('.geojson');
    });
    if (!pincodeFile?.Key) {
      return NextResponse.json(
        { error: `No civic amenities pincode boundary file found for district "${district}"` },
        { status: 404 }
      );
    }

    const cacheKey = `${state.trim().toLowerCase()}|${districtFolderName}`;
    const cached = enrichedCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ENRICHED_CACHE_TTL_MS) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': 'application/geo+json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // --- Load + enrich the pincode geojson ---
    const pincodeGeo = (await fetchJson(s3Client, pincodeFile.Key)) as {
      features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
    };
    const features = pincodeGeo.features ?? [];
    if (features.length === 0) {
      return new NextResponse(JSON.stringify(pincodeGeo), {
        headers: {
          'Content-Type': 'application/geo+json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    try {
      // 1) Taluk boundaries come from the Gram Panchayat dataset (same district folder
      //    name), whose features carry taluk_panchayat / kgis_civil_taluk_name.
      const talukKey = `Gram Panchayat Boundaries/India/${stateFolderName}/Districts/${districtFolderName}/${districtFolderName}_taluk_boundaries.geojson`;
      const talukGeo = (await fetchJson(s3Client, talukKey)) as {
        features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
      };
      const talukFeatures = talukGeo.features ?? [];

      // 2) Per-pincode taluk + grouping for the deeper lookups.
      const talukOf: Record<number, string | undefined> = {};
      const pincodesByTaluk = new Map<string, number[]>();
      features.forEach((feature, index) => {
        const points = candidatePoints(feature);
        if (points.length === 0) return;
        const containing = featureContainingPoints(talukFeatures, points);
        const talukName = (containing?.properties?.taluk_panchayat ??
          containing?.properties?.kgis_civil_taluk_name) as string | undefined;
        if (!talukName) return;
        talukOf[index] = talukName.trim();
        const list = pincodesByTaluk.get(talukName.trim()) ?? [];
        list.push(index);
        pincodesByTaluk.set(talukName.trim(), list);
      });

      // 3) For each distinct taluk, fetch its GP boundaries + hobli villages in parallel
      //    and resolve each pincode's gram panchayat / hobli. Failures degrade gracefully
      //    (that pincode just keeps the fields it has).
      const adminDistrictPrefix = `Administrative Boundaries/india/${state.trim().toLowerCase()}/Districts/`;
      const adminListCommand = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: adminDistrictPrefix,
        Delimiter: '/',
      });
      const adminListResponse = await s3Client.send(adminListCommand);
      const adminDistrictFolder = adminListResponse.CommonPrefixes?.find((prefix) => {
        const folderName = prefix.Prefix?.split('/').slice(-2)[0] || '';
        return namesMatch(cleanFolderName(folderName), districtFolderName);
      });

      // Village counts + names per pincode feature index, accumulated across every
      // hobli's village file in the taluk and written back once all lookups finish.
      // Both fields come from the same per-village pass, so "No. of Villages" and
      // "Villages" can never disagree.
      const villageDataOf: Record<number, { count: number; names: string[] }> = {};

      await Promise.all(
        Array.from(pincodesByTaluk.entries()).map(async ([talukName, indexes]) => {
          // Gram panchayat of each pincode (from the taluk's GP boundaries file).
          try {
            const gpKey = `Gram Panchayat Boundaries/India/${stateFolderName}/Districts/${districtFolderName}/Taluk_Panchayats/${talukName}/${talukName}_gram_panchayat_boundaries.geojson`;
            const gpGeo = (await fetchJson(s3Client, gpKey)) as {
              features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
            };
            const gpFeatures = gpGeo.features ?? [];
            for (const index of indexes) {
              const points = candidatePoints(features[index]!);
              if (points.length === 0) continue;
              const containing = featureContainingPoints(gpFeatures, points);
              const gpName = containing?.properties?.gram_panchayat as string | undefined;
              if (gpName && features[index]!.properties) {
                features[index]!.properties!['gram_panchayat'] = String(gpName).trim();
              }
            }
          } catch (e) {
            console.warn(`[civic-pincode-boundaries] GP lookup failed for taluk "${talukName}":`, e);
          }

          // Hobli of each pincode (from the hobli folders' village files, named after the hobli).
          try {
            if (!adminDistrictFolder?.Prefix) return;
            const hobliListCommand = new ListObjectsV2Command({
              Bucket: S3_BUCKET,
              Prefix: `${adminDistrictFolder.Prefix}SubDistricts/${talukName}/Hoblis/`,
              Delimiter: '/',
            });
            const hobliListResponse = await s3Client.send(hobliListCommand);
            const hobliFolders = (hobliListResponse.CommonPrefixes ?? [])
              .map((prefix) => prefix.Prefix?.split('/').slice(-2)[0] || '')
              .filter(Boolean);

            await Promise.all(
              hobliFolders.map(async (hobliName) => {
                const villageKey = `${adminDistrictFolder.Prefix}SubDistricts/${talukName}/Hoblis/${hobliName}/${hobliName}_village_boundary.geojson`;
                try {
                  const villageGeo = (await fetchJson(s3Client, villageKey)) as {
                    features: Array<{ geometry?: unknown; properties?: Record<string, unknown> }>;
                  };
                  const villageFeatures = villageGeo.features ?? [];
                  for (const index of indexes) {
                    if (features[index]!.properties?.hobli) continue; // already resolved
                    const points = candidatePoints(features[index]!);
                    if (points.length === 0) continue;
                    if (featureContainingPoints(villageFeatures, points)) {
                      features[index]!.properties!['hobli'] = hobliName;
                    }
                  }

                  // Count + list the villages of this hobli that lie inside each pincode
                  // polygon in this taluk. Village boundary features carry their name
                  // under KGISVillageName (the key the map's village labels read); a
                  // fallback chain tolerates the odd non-KGIS file. A village belongs to
                  // exactly one pincode - the first whose polygon contains any of its
                  // candidate points (centroid or ring starts).
                  for (const village of villageFeatures) {
                    const villageName = String(
                      village.properties?.KGISVillageName ??
                        village.properties?.village_name ??
                        village.properties?.Village_Name ??
                        village.properties?.vill_nm ??
                        village.properties?.name ??
                        ''
                    ).trim();
                    const villagePoints = candidatePoints(village);
                    if (villagePoints.length === 0) continue;
                    for (const index of indexes) {
                      const pincodeGeometry = features[index]?.geometry;
                      if (!pincodeGeometry) continue;
                      let inside = false;
                      for (const pt of villagePoints) {
                        try {
                          if (booleanPointInPolygon(pt, pincodeGeometry as never)) {
                            inside = true;
                            break;
                          }
                        } catch {
                          // skip malformed pincode geometries
                        }
                      }
                      if (inside) {
                        const entry = villageDataOf[index] ?? { count: 0, names: [] };
                        entry.count += 1;
                        if (villageName) entry.names.push(villageName);
                        villageDataOf[index] = entry;
                        break;
                      }
                    }
                  }
                } catch (e) {
                  console.warn(`[civic-pincode-boundaries] Hobli lookup failed for "${hobliName}":`, e);
                }
              })
            );
          } catch (e) {
            console.warn(`[civic-pincode-boundaries] Hobli lookup failed for taluk "${talukName}":`, e);
          }
        })
      );

      // 4) Attach the taluk name and write the enriched result back into the features.
      Object.entries(talukOf).forEach(([index, talukName]) => {
        if (talukName && features[Number(index)]?.properties) {
          features[Number(index)]!.properties!['taluk'] = talukName;
        }
      });

      // 4b) Attach the per-pincode village count + comma-separated village names
      //     (accumulated from the same village features, so they always match).
      Object.entries(villageDataOf).forEach(([index, data]) => {
        const props = features[Number(index)]?.properties;
        if (!props) return;
        props['no_of_villages'] = data.count;
        props['villages'] = data.names.join(', ');
      });
    } catch (e) {
      // Enrichment is best-effort: if any part of the join fails, still serve the plain
      // pincode boundaries (the popup just shows pin_code + district).
      console.warn(`[civic-pincode-boundaries] Enrichment skipped for "${districtFolderName}":`, e);
    }

    const enriched = JSON.stringify(pincodeGeo);
    enrichedCache.set(cacheKey, { data: enriched, ts: Date.now() });

    return new NextResponse(enriched, {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching civic amenities pincode boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load civic amenities pincode boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
