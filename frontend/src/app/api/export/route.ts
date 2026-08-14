import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { parseUpstreamError } from "./_error";

// Proxies the Explore page's "Export" action to the FastAPI backend, which converts the
// clicked feature via the worker's GDAL/OGR toolchain and returns the file directly. Kept
// server-side (rather than the browser calling the API origin itself) so this never needs
// CORS configuration for whatever port the frontend happens to be running on.
const EXPORT_FORMATS = ["geojson", "shapefile", "kml", "kmz", "gpkg", "gdb", "csv"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  let body: {
    exportFormat?: unknown;
    geometry?: unknown;
    properties?: unknown;
    nameHint?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  if (!isExportFormat(body.exportFormat)) {
    return NextResponse.json(
      { error: `exportFormat must be one of: ${EXPORT_FORMATS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!body.geometry || typeof body.geometry !== "object") {
    return NextResponse.json({ error: "geometry is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.internalApiUrl}/api/v1/export/feature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        export_format: body.exportFormat,
        geometry: body.geometry,
        properties:
          body.properties && typeof body.properties === "object" ? body.properties : {},
        name_hint:
          typeof body.nameHint === "string" && body.nameHint.trim() ? body.nameHint : "export",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("[export] API request failed:", error);
    return NextResponse.json({ error: "Export service is unreachable" }, { status: 502 });
  }

  if (!upstream.ok) {
    const message = await parseUpstreamError(upstream, upstream.status);
    return NextResponse.json({ error: message }, { status: upstream.status });
  }

  const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";
  const contentDisposition = upstream.headers.get("Content-Disposition") ?? "attachment";
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
}
