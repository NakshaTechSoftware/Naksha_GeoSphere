import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { getSatelliteProductConfig } from "@/lib/weather/imdSatelliteProvider";
import type { SatelliteProduct } from "@/lib/weather/imdSatelliteTypes";
import { fetchImdAsset } from "@/lib/weather/imdFetch";

const VALID_PRODUCTS = new Set<SatelliteProduct>(["ir1", "visible", "water_vapour", "ctt"]);
const FETCH_TIMEOUT_MS = 15_000;

// In-memory cache keyed by product. Each entry holds the decoded frame PNGs
// (as Buffers) so repeated manifest requests don't re-fetch and re-decode the
// ~10 MB GIF every time. The cache is invalidated when the serverless function
// cold-starts, which is fine because the IMD GIF updates roughly every 30 min.
const frameCache = new Map<
  SatelliteProduct,
  { frames: Buffer[]; lastModified: string; totalSize: number; fetchedAt: number }
>();

export async function GET(request: NextRequest) {
  const product = (request.nextUrl.searchParams.get("product") ?? "ir1") as SatelliteProduct;

  if (!VALID_PRODUCTS.has(product)) {
    return NextResponse.json({ error: `Unknown satellite product "${product}"` }, { status: 400 });
  }

  const config = getSatelliteProductConfig(product);
  const cached = frameCache.get(product);

  // Re-fetch if cache is older than 10 minutes
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) {
    return NextResponse.json({
      product,
      frames: cached.frames.map((_, i) => ({ index: i, width: config.frameSize[0], height: config.frameSize[1] })),
      lastModified: cached.lastModified,
      totalSize: cached.totalSize,
      cached: true,
    });
  }

  try {
    const result = await fetchImdAsset(config.gifUrl, { timeoutMs: FETCH_TIMEOUT_MS });

    if (result.status < 200 || result.status >= 300) {
      return NextResponse.json(
        { error: `IMD satellite upstream returned ${result.status}` },
        { status: 502 },
      );
    }

    const contentType = result.headers["content-type"] ?? "";
    if (!contentType.includes("image/")) {
      return NextResponse.json(
        { error: `Unexpected IMD satellite content type "${contentType}"` },
        { status: 502 },
      );
    }

    const gifBuffer = result.body;
    const lastModified = result.headers["last-modified"] ?? new Date().toISOString();

    // Decode animated GIF into individual frames using sharp
    const metadata = await sharp(gifBuffer, { animated: true, pages: -1 }).metadata();
    const pageCount = metadata.pages ?? 1;
    const pageHeight = metadata.pageHeight ?? metadata.height ?? config.frameSize[1];

    const frames: Buffer[] = [];

    for (let i = 0; i < pageCount; i++) {
      // Extract each frame as a PNG
      const frameBuffer = await sharp(gifBuffer, { animated: false, page: i })
        .png()
        .toBuffer();
      frames.push(frameBuffer);
    }

    // Cache the decoded frames
    frameCache.set(product, {
      frames,
      lastModified,
      totalSize: gifBuffer.length,
      fetchedAt: Date.now(),
    });

    return NextResponse.json({
      product,
      frames: frames.map((_, i) => ({ index: i, width: metadata.width ?? config.frameSize[0], height: pageHeight })),
      lastModified,
      totalSize: gifBuffer.length,
      frameCount: pageCount,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown IMD satellite fetch failure";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
