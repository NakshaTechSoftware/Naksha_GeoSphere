import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

const client = new S3Client({
  endpoint: "http://192.168.10.81:9010",
  region: "geosphere",
  credentials: {
    accessKeyId: "geosphere_storage",
    secretAccessKey: "706f803f67c143c884305e7085b59210ffb29ac69e724a70",
  },
  forcePathStyle: true,
});

const KEY =
  "Administrative Boundaries/india/karnataka/KARNATAKA/Gram Panchayats/KARNATAKA_GRAM_PANCHAYATS_WEB.geojson";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state")?.trim().toLowerCase();
  if (state !== "karnataka") {
    return NextResponse.json(
      { error: `No Gram Panchayat data available for "${state ?? ""}"` },
      { status: 404 }
    );
  }

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: "geosphere-source-data", Key: KEY })
    );
    const geojson = (await response.Body?.transformToString()) ?? "";
    return new NextResponse(geojson, {
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[state-gram-panchayats] Failed to load boundaries:", error);
    return NextResponse.json({ error: "Failed to load Gram Panchayat boundaries" }, { status: 500 });
  }
}
