import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Remote MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

const POLICE_PREFIX = 'Police Station Boundaries/V3/Karnataka/Statewide/';
const POLICE_TYPES: Record<string, string> = {
  all: 'Karnataka_all_police_locations_and_boundaries.geojson',
  law_and_order: 'Karnataka_Law_and_Order_locations_and_boundaries.geojson',
  women_police: 'Karnataka_Women_Police_locations_and_boundaries.geojson',
  traffic_police: 'Karnataka_Traffic_Police_locations_and_boundaries.geojson',
  railway_police: 'Karnataka_Railway_Police_locations_and_boundaries.geojson',
  railway_police_outpost: 'Karnataka_Railway_Police_Outpost_locations_and_boundaries.geojson',
  police_outpost: 'Karnataka_Police_OutPost_locations_and_boundaries.geojson',
  police_check_post: 'Karnataka_Police_Check_Post_locations_and_boundaries.geojson',
  police_forest_cell: 'Karnataka_Police_Forest_Cell_locations_and_boundaries.geojson',
  district_armed_reserve: 'Karnataka_District_Armed_Reserve_locations_and_boundaries.geojson',
  city_armed_reserve: 'Karnataka_City_Armed_Reserve_locations_and_boundaries.geojson',
  city_crime_branch: 'Karnataka_City_Crime_Branch_locations_and_boundaries.geojson',
  coastal_security: 'Karnataka_Coastal_Security_locations_and_boundaries.geojson',
  cyber_crime: 'Karnataka_Cyber_Crime_locations_and_boundaries.geojson',
  ksisf: 'Karnataka_KSISF_locations_and_boundaries.geojson',
  ksrp: 'Karnataka_KSRP_locations_and_boundaries.geojson',
};

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get('state');
    const policeType = request.nextUrl.searchParams.get('type')?.trim().toLowerCase() || 'all';
    const district = request.nextUrl.searchParams.get('district')?.trim();
    const filename = POLICE_TYPES[policeType];
    const key = state?.trim().toLowerCase() === 'karnataka' && filename
      ? `${POLICE_PREFIX}${filename}`
      : undefined;

    if (!key) {
      return NextResponse.json(
        { error: `No ${policeType} police data available for "${state ?? ''}"` },
        { status: 404 }
      );
    }

    const s3Client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
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
      console.error(
        `Failed to fetch police station geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`
      );
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    let geojson = await fileResponse.text();
    if (district && district.toLowerCase() !== 'all') {
      const collection = JSON.parse(geojson) as GeoJSON.FeatureCollection;
      collection.features = collection.features.filter((feature) =>
        String(feature.properties?.district ?? '').localeCompare(district, undefined, { sensitivity: 'base' }) === 0
      );
      geojson = JSON.stringify(collection);
    }

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
    console.error('Error fetching police station boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load police station boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
