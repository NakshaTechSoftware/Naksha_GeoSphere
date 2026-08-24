import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { getSatelliteProductConfig } from "@/lib/weather/imdSatelliteProvider";
import type { SatelliteProduct } from "@/lib/weather/imdSatelliteTypes";
import { fetchImdAsset } from "@/lib/weather/imdFetch";

const VALID_PRODUCTS = new Set<SatelliteProduct>(["ir1", "visible", "water_vapour", "ctt"]);
const FETCH_TIMEOUT_MS = 15_000;

// Crop box extracted from IMD GIF gridlines (same for all products):
//   x: 5 + 5 = 10  →  x: 1205 - 5 = 1200  (plot area with gridlines)
//   y: 100         →  y: 1225          (plot area with gridlines)
//   width: 1200    →  height: 1125
// This crops out the outer decorative border/footer while keeping the
// internal latitude/longitude gridlines that give the imagery georeferencing.
const CROP_BOX = { left: 5, top: 100, width: 1200, height: 1125 };

// In-memory cache keyed by product. Holds the full GIF buffer so individual
// frame requests don't re-fetch the ~10 MB GIF each time.
const gifCache = new Map<
  SatelliteProduct,
  { buffer: Buffer; fetchedAt: number }
>();

async function getGifBuffer(product: SatelliteProduct): Promise<Buffer> {
  const cached = gifCache.get(product);
  // Re-fetch if cache is older than 10 minutes
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
    return cached.buffer;
  }

  const config = getSatelliteProductConfig(product);
  const result = await fetchImdAsset(config.gifUrl, { timeoutMs: FETCH_TIMEOUT_MS });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`IMD satellite upstream returned ${result.status}`);
  }

  gifCache.set(product, { buffer: result.body, fetchedAt: Date.now() });
  return result.body;
}

export async function GET(request: NextRequest) {
  const product = (request.nextUrl.searchParams.get("product") ?? "ir1") as SatelliteProduct;
  const frameIndex = parseInt(request.nextUrl.searchParams.get("frame") ?? "0", 10);

  if (!VALID_PRODUCTS.has(product)) {
    return NextResponse.json({ error: `Unknown satellite product "${product}"` }, { status: 400 });
  }

  if (isNaN(frameIndex) || frameIndex < 0) {
    return NextResponse.json({ error: `Invalid frame index "${frameIndex}"` }, { status: 400 });
  }

  try {
    const gifBuffer = await getGifBuffer(product);
    const metadata = await sharp(gifBuffer, { animated: true, pages: -1 }).metadata();
    const pageCount = metadata.pages ?? 1;

    if (frameIndex >= pageCount) {
      return NextResponse.json(
        { error: `Frame index ${frameIndex} exceeds available frames (${pageCount})` },
        { status: 400 },
      );
    }

    // Extract frame, then crop to consistent dimensions so all products
    // align when mapped to the same geographic bounds.
    const frameBuffer = await sharp(gifBuffer, { animated: false, page: frameIndex })
      .extract(CROP_BOX)
      .png()
      .toBuffer();

    return new NextResponse(frameBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*",
        "X-Source-Attribution": "India Meteorological Department (IMD)",
        "X-Frame-Index": String(frameIndex),
        "X-Frame-Total": String(pageCount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown IMD satellite frame failure";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
