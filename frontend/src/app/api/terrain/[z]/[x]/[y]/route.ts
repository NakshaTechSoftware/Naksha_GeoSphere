import { fromFile, type GeoTIFFImage, type TypedArrayWithDimensions } from "geotiff";
import sharp from "sharp";

import { findDemFile } from "@/lib/demFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TILE_SIZE = 256;
const MAX_NATIVE_ZOOM = 12;
const WEB_MERCATOR_HALF_WORLD = 20_037_508.342789244;
const WEB_MERCATOR_WORLD = WEB_MERCATOR_HALF_WORLD * 2;

type DemImage = {
  image: GeoTIFFImage;
  bounds: [number, number, number, number];
  width: number;
  height: number;
};

const imagePromises = new Map<string, Promise<DemImage>>();
const tileCache = new Map<string, Promise<Uint8Array>>();

type Rgb = readonly [number, number, number];
const ELEVATION_COLORS: ReadonlyArray<readonly [number, Rgb]> = [
  [-500, [18, 50, 170]],
  [0, [20, 112, 220]],
  [100, [12, 190, 222]],
  [300, [21, 210, 167]],
  [600, [55, 196, 92]],
  [1_000, [155, 205, 65]],
  [1_500, [245, 220, 70]],
  [2_500, [255, 153, 45]],
  [4_000, [235, 67, 35]],
  [6_000, [166, 24, 38]],
  [8_600, [255, 250, 245]],
];

function elevationColor(elevation: number): Rgb {
  for (let index = 1; index < ELEVATION_COLORS.length; index += 1) {
    const lower = ELEVATION_COLORS[index - 1]!;
    const upper = ELEVATION_COLORS[index]!;
    if (elevation <= upper[0]) {
      const ratio = Math.max(0, Math.min(1, (elevation - lower[0]) / (upper[0] - lower[0])));
      return [
        Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * ratio),
        Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * ratio),
        Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * ratio),
      ];
    }
  }
  return ELEVATION_COLORS.at(-1)![1];
}

function getDemImage(file: string): Promise<DemImage> {
  let promise = imagePromises.get(file);
  if (!promise) {
    promise = fromFile(file).then(async (tiff) => {
      const image = await tiff.getImage();
      return {
        image,
        bounds: image.getBoundingBox() as [number, number, number, number],
        width: image.getWidth(),
        height: image.getHeight(),
      };
    });
    imagePromises.set(file, promise);
  }
  return promise;
}

async function emptyTile(colorized: boolean): Promise<Uint8Array> {
  // Mapbox Terrain-RGB encodes 0 m as RGB(1, 134, 160). Transparent/black terrain pixels
  // decode to -10,000 m and produce the enormous vertical walls seen at dataset edges.
  const background = colorized
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 1, g: 134, b: 160, alpha: 1 };
  return sharp({ create: { width: TILE_SIZE, height: TILE_SIZE, channels: 4, background } })
    .png()
    .toBuffer();
}

async function renderTile(z: number, x: number, y: number, colorized: boolean): Promise<Uint8Array> {
  const dem = await getDemImage(findDemFile(z));
  const span = WEB_MERCATOR_WORLD / 2 ** z;
  const tileLeft = -WEB_MERCATOR_HALF_WORLD + x * span;
  const tileRight = tileLeft + span;
  const tileTop = WEB_MERCATOR_HALF_WORLD - y * span;
  const tileBottom = tileTop - span;
  const [demLeft, demBottom, demRight, demTop] = dem.bounds;

  const left = Math.max(tileLeft, demLeft);
  const right = Math.min(tileRight, demRight);
  const bottom = Math.max(tileBottom, demBottom);
  const top = Math.min(tileTop, demTop);
  if (left >= right || bottom >= top) return emptyTile(colorized);

  const sourceX0 = Math.max(0, Math.floor(((left - demLeft) / (demRight - demLeft)) * dem.width));
  const sourceX1 = Math.min(
    dem.width,
    Math.ceil(((right - demLeft) / (demRight - demLeft)) * dem.width),
  );
  const sourceY0 = Math.max(0, Math.floor(((demTop - top) / (demTop - demBottom)) * dem.height));
  const sourceY1 = Math.min(
    dem.height,
    Math.ceil(((demTop - bottom) / (demTop - demBottom)) * dem.height),
  );

  const destX0 = Math.max(0, Math.floor(((left - tileLeft) / span) * TILE_SIZE));
  const destX1 = Math.min(TILE_SIZE, Math.ceil(((right - tileLeft) / span) * TILE_SIZE));
  const destY0 = Math.max(0, Math.floor(((tileTop - top) / span) * TILE_SIZE));
  const destY1 = Math.min(TILE_SIZE, Math.ceil(((tileTop - bottom) / span) * TILE_SIZE));
  const destWidth = Math.max(1, destX1 - destX0);
  const destHeight = Math.max(1, destY1 - destY0);

  const elevations = (await dem.image.readRasters({
    window: [sourceX0, sourceY0, sourceX1, sourceY1],
    samples: [0],
    interleave: true,
    width: destWidth,
    height: destHeight,
    resampleMethod: "bilinear",
  })) as TypedArrayWithDimensions;

  const rgba = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  if (!colorized) {
    // Initialize portions outside the TIFF footprint to correctly encoded 0 m terrain.
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba[offset] = 1;
      rgba[offset + 1] = 134;
      rgba[offset + 2] = 160;
      rgba[offset + 3] = 255;
    }
  }
  for (let row = 0; row < destHeight; row += 1) {
    for (let col = 0; col < destWidth; col += 1) {
      const rawElevation = Number(elevations[row * destWidth + col] ?? 0);
      // The source has no declared nodata value but uses Int16 sentinels (notably 32767)
      // around its cutline. Values outside India's physical elevation range are sea level.
      const elevation = rawElevation >= -500 && rawElevation <= 9_000 ? rawElevation : 0;
      const offset = ((destY0 + row) * TILE_SIZE + destX0 + col) * 4;
      if (colorized) {
        if (elevation === 0) continue;
        const color = elevationColor(elevation);
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
      } else {
        const encoded = Math.max(
          0,
          Math.min(16_777_215, Math.round((elevation + 10_000) * 10)),
        );
        rgba[offset] = Math.floor(encoded / 65_536);
        rgba[offset + 1] = Math.floor((encoded % 65_536) / 256);
        rgba[offset + 2] = encoded % 256;
      }
      rgba[offset + 3] = 255;
    }
  }

  return sharp(rgba, { raw: { width: TILE_SIZE, height: TILE_SIZE, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const params = await context.params;
  const z = Number(params.z);
  const x = Number(params.x);
  const y = Number(params.y.replace(/\.png$/i, ""));
  const limit = 2 ** z;
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > MAX_NATIVE_ZOOM || x < 0 || y < 0 || x >= limit || y >= limit) {
    return new Response("Invalid terrain tile", { status: 400 });
  }

  const colorized = new URL(request.url).searchParams.get("mode") === "color";
  const cacheKey = `${colorized ? "color" : "terrain"}/${z}/${x}/${y}`;
  let tile = tileCache.get(cacheKey);
  if (!tile) {
    tile = renderTile(z, x, y, colorized);
    tileCache.set(cacheKey, tile);
    if (tileCache.size > 256) tileCache.delete(tileCache.keys().next().value!);
  }

  try {
    const png = await tile;
    return new Response(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    tileCache.delete(cacheKey);
    console.error(`[terrain] Failed to render ${cacheKey}:`, error);
    return new Response("Terrain tile unavailable", { status: 500 });
  }
}
