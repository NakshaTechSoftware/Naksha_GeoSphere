import { NextRequest } from "next/server";
import { config } from "@/lib/config";

// Proxies the finished export straight through from the backend's temporary-bucket
// download endpoint to the browser, streaming the response body without ever
// buffering it into one in-memory value here - a whole-district export can be
// hundreds of MB, and the point of this route existing (instead of the bulk export
// route embedding the file inline) is to never hold that much data as a single JS
// value in this process. See src/app/api/export/bulk/route.ts for the full picture.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) {
    return new Response(JSON.stringify({ error: "key is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(`${config.internalApiUrl}/api/v1/export/download/${key}`, {
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      JSON.stringify({ error: "Export file not found or already downloaded" }),
      { status: upstream.status || 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
