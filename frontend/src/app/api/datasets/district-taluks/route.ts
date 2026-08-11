import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { namesMatch } from "../_folder-match";

const client = new S3Client({
  endpoint: "http://192.168.10.81:9010",
  region: "geosphere",
  credentials: {
    accessKeyId: "geosphere_storage",
    secretAccessKey: "706f803f67c143c884305e7085b59210ffb29ac69e724a70",
  },
  forcePathStyle: true,
});
const BUCKET = "geosphere-source-data";
const TALUKS_KEY =
  "Administrative Boundaries/india/karnataka/KARNATAKA/KARNATAKA_TALUKS.geojson";

const DISTRICTS: Array<[string, string]> = [
  ["01", "Belagavi"], ["02", "Bagalkote"], ["03", "Vijayapura"],
  ["04", "Kalaburgi"], ["05", "Bidar"], ["06", "Raichur"], ["07", "Koppal"],
  ["08", "Gadag"], ["09", "Dharwad"], ["10", "Uttara Kannada"], ["11", "Haveri"],
  ["12", "Ballari"], ["13", "Chitradurga"], ["14", "Davanagere"],
  ["15", "Shivamogga"], ["16", "Udupi"], ["17", "Chikkamagaluru"],
  ["18", "Tumakuru"], ["19", "Kolara"], ["20", "Bengaluru (Urban)"],
  ["21", "Bengaluru (Rural)"], ["22", "Mandya"], ["23", "Hassan"],
  ["24", "Dakshina Kannada"], ["25", "Kodagu"], ["26", "Mysuru"],
  ["27", "Chamarajanagara"], ["28", "Chikkaballapura"],
  ["29", "Bengaluru South"], ["30", "Yadgir"], ["31", "Vijayanagara"],
];

async function readGeoJson(key: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return JSON.parse((await response.Body?.transformToString()) ?? "{}") as GeoJSON.FeatureCollection;
}

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  if (!district || !state) {
    return NextResponse.json({ error: "Both district and state parameters are required" }, { status: 400 });
  }
  if (!namesMatch(state, "Karnataka")) {
    return NextResponse.json({ error: `No taluk data available for state "${state}"` }, { status: 404 });
  }

  const districtCode = DISTRICTS.find(([, name]) => namesMatch(name, district))?.[0];
  if (!districtCode) {
    return NextResponse.json({ error: `District "${district}" was not found in the updated dataset` }, { status: 404 });
  }

  try {
    const data = await readGeoJson(TALUKS_KEY);
    const features = data.features.filter(
      (feature) => String(feature.properties?.KGISDistrictCode ?? "").padStart(2, "0") === districtCode
    );
    return NextResponse.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("[district-taluks] Failed to load updated taluk boundaries:", error);
    return NextResponse.json({ error: "Failed to load taluk boundaries" }, { status: 500 });
  }
}
