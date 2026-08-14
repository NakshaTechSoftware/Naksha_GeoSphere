import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { namesEqual } from "../_folder-match";

// Remote MinIO configuration - mirrors the other dataset routes.
const MINIO_ENDPOINT = "192.168.10.81:9010";
const MINIO_ACCESS_KEY = "geosphere_storage";
const MINIO_SECRET_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70";
const S3_REGION = "geosphere";
const S3_BUCKET = "geosphere-source-data";
const DISTRICT_PREFIX = "Administrative Boundaries/india/karnataka/Roads/Districts/";
const TALUK_PREFIX = "Administrative Boundaries/india/karnataka/Roads/Taluks/";

// KGIS's own per-district (and per-taluk) Roadways/ folders already split National Highway/
// State Highway/District Road into one manageable file each (hundreds of KB to a few MB) -
// unlike the GBA data, this one arrives pre-split, so it's served the same way district-
// taluks is: fetch the one specific district(+taluk)+category file directly, not a combined
// statewide file filtered by property.
//
// local_roads (the full local street network, KGIS's "Road Center Line" layer) is different:
// it's only stored under this key at TALUK granularity - the district-level files are still
// 100-300MB+ raw, too large to hand to the browser, so they were never uploaded here. Each
// taluk file was also pre-simplified and stripped down to just type/Road_Name/status
// properties (mapshaper `-simplify dp 15% keep-shapes`) before upload, shrinking every taluk
// to a few MB. Callers must always pass `taluk` when requesting local_roads - there is no
// district-level fallback.
const CATEGORY_SUFFIX: Record<string, string> = {
  national_highway: "National_Highway",
  state_highway: "State_Highway",
  district_road: "District_Road",
  local_roads: "Road_Center_Line",
};

const EMPTY_COLLECTION = JSON.stringify({ type: "FeatureCollection", features: [] });

function s3Client() {
  return new S3Client({
    endpoint: `http://${MINIO_ENDPOINT}`,
    region: S3_REGION,
    credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
    forcePathStyle: true,
  });
}

// Clicking a district (or taluk) fires 3-4 of these requests at once (NH/SH/District Road,
// plus local_roads at taluk level - see loadRoadsHighways), and every one of them was
// independently re-listing the same district/taluk folders via ListObjectsV2 just to
// fuzzy-match the name, plus re-fetching+re-parsing files that never change once uploaded.
// Same fix GBA needed (see _gba.ts) for the same reason: it's the S3 round-trips, not the
// per-request work, that made the first click after a server (re)start feel slow.
const folderListCache = new Map<string, string[]>();
const geojsonCache = new Map<string, string>();

async function listFolderNames(client: S3Client, prefix: string): Promise<string[]> {
  const cached = folderListCache.get(prefix);
  if (cached) return cached;
  const listing = await client.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, Delimiter: "/" }));
  const names = (listing.CommonPrefixes ?? [])
    .map((p) => p.Prefix?.slice(prefix.length).replace(/\/$/, ""))
    .filter((name): name is string => Boolean(name));
  folderListCache.set(prefix, names);
  return names;
}

export async function GET(request: NextRequest) {
  try {
    const district = request.nextUrl.searchParams.get("district")?.trim();
    const taluk = request.nextUrl.searchParams.get("taluk")?.trim();
    const category = request.nextUrl.searchParams.get("category")?.trim();
    const suffix = category ? CATEGORY_SUFFIX[category] : undefined;

    if (!district || !suffix) {
      return NextResponse.json(
        { error: "district and a valid category (national_highway, state_highway, district_road) are required" },
        { status: 400 }
      );
    }

    const client = s3Client();

    // Folder names in storage are the exact KGIS names (e.g. "Bengaluru (Rural)") - list
    // them once and fuzzy-match rather than assuming the caller's spelling lines up exactly,
    // same approach district-taluks/taluk-hoblies already use.
    const districtFolders = await listFolderNames(client, taluk ? TALUK_PREFIX : DISTRICT_PREFIX);
    const matchedDistrict = districtFolders.find((name) => namesEqual(name, district));
    if (!matchedDistrict) {
      return NextResponse.json({ error: `No road data available for district "${district}"` }, { status: 404 });
    }

    let key: string;
    if (taluk) {
      const talukFolders = await listFolderNames(client, `${TALUK_PREFIX}${matchedDistrict}/`);
      const matchedTaluk = talukFolders.find((name) => namesEqual(name, taluk));
      if (!matchedTaluk) {
        return NextResponse.json({ error: `No road data available for taluk "${taluk}"` }, { status: 404 });
      }
      key = `${TALUK_PREFIX}${matchedDistrict}/${matchedTaluk}/${matchedTaluk}_${suffix}.geojson`;
    } else {
      key = `${DISTRICT_PREFIX}${matchedDistrict}/${matchedDistrict}_${suffix}.geojson`;
    }

    let geojson = geojsonCache.get(key);
    if (geojson === undefined) {
      const presignedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), {
        expiresIn: 3600,
      });
      const fileResponse = await fetch(presignedUrl, { cache: "no-store" });

      // A taluk genuinely having no National Highway (etc.) running through it is normal and
      // common - not every category exists for every taluk. Return an empty collection rather
      // than a 404/500 so the caller doesn't have to special-case "this level has no data".
      if (!fileResponse.ok) {
        if (taluk && fileResponse.status === 404) {
          return new NextResponse(EMPTY_COLLECTION, {
            headers: { "Content-Type": "application/geo+json", "Access-Control-Allow-Origin": "*" },
          });
        }
        throw new Error(`MinIO returned ${fileResponse.status} for ${key}`);
      }
      geojson = await fileResponse.text();
      geojsonCache.set(key, geojson);
    }

    return new NextResponse(geojson, {
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error fetching road data:", error);
    return NextResponse.json(
      { error: "Failed to load road data", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
