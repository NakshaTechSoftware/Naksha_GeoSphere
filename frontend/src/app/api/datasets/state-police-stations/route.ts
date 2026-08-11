import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";

const STATE_POLICE_KEYS: Record<string, string> = {
  karnataka:
    "Administrative Boundaries/india/karnataka/KARNATAKA/KARNATAKA_POLICE_STATIONS.geojson",
};

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get("state");
    const key = state ? STATE_POLICE_KEYS[state.trim().toLowerCase()] : undefined;
    if (!key) {
      return NextResponse.json(
        { error: `No police station boundary data available for "${state ?? ""}"` },
        { status: 404 },
      );
    }

    const client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
      forcePathStyle: true,
    });
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`MinIO returned ${response.status}`);

    return new NextResponse(await response.text(), {
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error fetching police station boundaries:", error);
    return NextResponse.json(
      {
        error: "Failed to load police station boundaries",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
