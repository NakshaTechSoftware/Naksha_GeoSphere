import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";
const PREFIX = "Administrative Boundaries/india/karnataka/KARNATAKA/Police Stations/";

export async function GET(request: NextRequest) {
  const folder = request.nextUrl.searchParams.get("folder")?.trim() ?? "";
  if (!/^[A-Za-z0-9._()-]+$/.test(folder)) {
    return NextResponse.json({ error: "Invalid police-station folder" }, { status: 400 });
  }
  try {
    const client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
      forcePathStyle: true,
    });
    const load = async (name: string) => {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: `${PREFIX}${folder}/${name}` }),
        { expiresIn: 3600 },
      );
      const response = await fetch(url, { cache: "no-store" });
      if (response.status === 404) return { type: "FeatureCollection", features: [] };
      if (!response.ok) throw new Error(`MinIO returned ${response.status} for ${name}`);
      return response.json();
    };
    const [hoblis, villages] = await Promise.all([
      load("hoblis_in_police_area.geojson"),
      load("villages_in_police_area.geojson"),
    ]);
    return NextResponse.json(
      { hoblis, villages },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (error) {
    console.error(`Failed to load police coverage for ${folder}:`, error);
    return NextResponse.json(
      { error: "Failed to load police-station administrative coverage" },
      { status: 500 },
    );
  }
}
