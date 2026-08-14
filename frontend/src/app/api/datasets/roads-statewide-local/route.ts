import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

// Serves the statewide local-road-network archive (Road Center Line, all 240 taluks merged)
// for the Roads hierarchy's "State" click-scope, as a PMTiles vector tile archive rather than
// one flat GeoJSON file. A flat file forces an all-or-nothing choice: either drop detail
// everywhere (unreadable once zoomed in) or keep it everywhere (a huge single fetch, and a
// cluttered mess zoomed out) - PMTiles instead lets MapLibre fetch only the tiles the current
// viewport/zoom actually needs, so it's naturally thinned out zoomed out and fully detailed
// zoomed in, the way Google Maps behaves. Built offline (see registerPmtilesProtocol) from
// the same per-taluk simplified files ../roads/route.ts serves, merged + simplified again via
// tippecanoe, converted to PMTiles via go-pmtiles.
//
// Like the district/taluk files, MapLibre's pmtiles protocol keeps issuing HTTP Range
// requests against this same URL for as long as the map is open, so this can't just hand
// back a presigned URL (those expire in an hour) - it proxies each Range request straight
// through to S3's own Range support instead, keeping the MinIO credentials server-side.
const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";
const OBJECT_KEY = "Administrative Boundaries/india/karnataka/Roads/Karnataka_Local_Roads_Statewide.pmtiles";

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
    console.error("Error heading roads-statewide-local:", error);
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

    // The AWS SDK's Node body is a Readable stream - Next.js' Response wants a Web
    // ReadableStream, so wrap it rather than buffering the whole (multi-hundred-MB) file.
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
    console.error("Error fetching roads-statewide-local:", error);
    return NextResponse.json({ error: "Failed to load statewide local roads tiles" }, { status: 500 });
  }
}
