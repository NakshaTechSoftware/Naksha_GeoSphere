import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

// Serves the statewide National/State/District Road highways (all 31 districts merged, one
// named layer per category) as a PMTiles vector tile archive, for the Roads hierarchy's
// "State" click-scope. Replaces fetching+merging 93 separate per-district-per-category files
// client-side on every "State" click (31 districts x 3 categories) - that fan-out was the
// actual slow part of "State" loading (each request cheap once the roads route's own cache is
// warm, but 93 of them add up, and the cache is empty again after every server restart). Built
// offline: merge every district's already-small highway file per category (~583MB raw across
// all 3 combined), tippecanoe -L to tag each category as its own named layer, go-pmtiles
// convert - landing at ~13MB total, one cached fetch instead of 93.
const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";
const OBJECT_KEY = "Administrative Boundaries/india/karnataka/Roads/Karnataka_Highways_Statewide.pmtiles";

function s3Client() {
  return new S3Client({
    endpoint: `http://${MINIO_ENDPOINT}`,
    region: S3_REGION,
    credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
}

export async function HEAD() {
  try {
    const client = s3Client();
    const head = await client.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: OBJECT_KEY }));
    return new NextResponse(null, {
      headers: {
        "Content-Length": String(head.ContentLength ?? 0),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error heading roads-statewide-highways:", error);
    return new NextResponse(null, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const client = s3Client();
    const range = request.headers.get("range") ?? undefined;
    const object = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: OBJECT_KEY, Range: range }));

    const body = object.Body as Readable | undefined;
    if (!body) throw new Error("Empty object body");

    const webStream = new ReadableStream({
      start(controller) {
        body.on("data", (chunk: Buffer) => controller.enqueue(chunk));
        body.on("end", () => controller.close());
        body.on("error", (err) => controller.error(err));
      },
      cancel() {
        body.destroy();
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    };
    if (object.ContentLength !== undefined) headers["Content-Length"] = String(object.ContentLength);
    if (object.ContentRange) headers["Content-Range"] = object.ContentRange;

    return new NextResponse(webStream, {
      status: object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    console.error("Error fetching roads-statewide-highways:", error);
    return NextResponse.json({ error: "Failed to load statewide highway tiles" }, { status: 500 });
  }
}
