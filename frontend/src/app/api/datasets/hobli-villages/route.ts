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
const PREFIX = "Administrative Boundaries/india/karnataka/KARNATAKA/";

const DISTRICTS: Array<[string, string, string]> = [
  ["01", "Belagavi", "01_Belagavi.geojson"], ["02", "Bagalkote", "02_Bagalkote.geojson"],
  ["03", "Vijayapura", "03_Vijayapura.geojson"], ["04", "Kalaburgi", "04_Kalaburgi.geojson"],
  ["05", "Bidar", "05_Bidar.geojson"], ["06", "Raichur", "06_Raichur.geojson"],
  ["07", "Koppal", "07_Koppal.geojson"], ["08", "Gadag", "08_Gadag.geojson"],
  ["09", "Dharwad", "09_Dharwad.geojson"], ["10", "Uttara Kannada", "10_Uttara_Kannada.geojson"],
  ["11", "Haveri", "11_Haveri.geojson"], ["12", "Ballari", "12_Ballari.geojson"],
  ["13", "Chitradurga", "13_Chitradurga.geojson"], ["14", "Davanagere", "14_Davanagere.geojson"],
  ["15", "Shivamogga", "15_Shivamogga.geojson"], ["16", "Udupi", "16_Udupi.geojson"],
  ["17", "Chikkamagaluru", "17_Chikkamagaluru.geojson"], ["18", "Tumakuru", "18_Tumakuru.geojson"],
  ["19", "Kolara", "19_Kolara.geojson"], ["20", "Bengaluru (Urban)", "20_Bengaluru_Urban.geojson"],
  ["21", "Bengaluru (Rural)", "21_Bengaluru_Rural.geojson"], ["22", "Mandya", "22_Mandya.geojson"],
  ["23", "Hassan", "23_Hassan.geojson"], ["24", "Dakshina Kannada", "24_Dakshina_Kannada.geojson"],
  ["25", "Kodagu", "25_Kodagu.geojson"], ["26", "Mysuru", "26_Mysuru.geojson"],
  ["27", "Chamarajanagara", "27_Chamarajanagara.geojson"],
  ["28", "Chikkaballapura", "28_Chikkaballapura.geojson"],
  ["29", "Bengaluru South", "29_Bengaluru_South.geojson"], ["30", "Yadgir", "30_Yadgir.geojson"],
  ["31", "Vijayanagara", "31_Vijayanagara.geojson"],
];

async function readGeoJson(key: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return JSON.parse((await response.Body?.transformToString()) ?? "{}") as GeoJSON.FeatureCollection;
}

let taluksCache: Promise<GeoJSON.FeatureCollection> | null = null;
let hobliesCache: Promise<GeoJSON.FeatureCollection> | null = null;
const getTaluks = () =>
  (taluksCache ??= readGeoJson(`${PREFIX}KARNATAKA_TALUKS.geojson`).catch((error) => {
    taluksCache = null;
    throw error;
  }));
const getHoblies = () =>
  (hobliesCache ??= readGeoJson(`${PREFIX}KARNATAKA_HOBLIS.geojson`).catch((error) => {
    hobliesCache = null;
    throw error;
  }));

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const taluk = request.nextUrl.searchParams.get("taluk")?.trim();
  const hobli = request.nextUrl.searchParams.get("hobli")?.trim();
  if (!district || !state || !taluk || !hobli) {
    return NextResponse.json({ error: "district, state, taluk, and hobli are required" }, { status: 400 });
  }
  if (!namesMatch(state, "Karnataka")) {
    return NextResponse.json({ error: `No village data available for state "${state}"` }, { status: 404 });
  }

  const districtEntry = DISTRICTS.find(([, name]) => namesMatch(name, district));
  if (!districtEntry) {
    return NextResponse.json({ error: `District "${district}" was not found` }, { status: 404 });
  }
  const [districtCode, , villageFile] = districtEntry;

  try {
    const [taluks, hoblies, villages] = await Promise.all([
      getTaluks(),
      getHoblies(),
      readGeoJson(`${PREFIX}Villages/${villageFile}`),
    ]);
    const matchingTaluk = taluks.features.find(
      (feature) =>
        String(feature.properties?.KGISDistrictCode ?? "").padStart(2, "0") === districtCode &&
        namesMatch(String(feature.properties?.KGISTalukName ?? ""), taluk)
    );
    const talukCode = String(matchingTaluk?.properties?.KGISTalukCode ?? "");
    const hobliIds = new Set(
      hoblies.features
        .filter(
          (feature) =>
            String(feature.properties?.KGISTalukCode ?? "") === talukCode &&
            namesMatch(String(feature.properties?.KGISHobliName ?? ""), hobli)
        )
        .map((feature) => String(feature.properties?.KGISHobliId ?? ""))
        .filter(Boolean)
    );
    if (!talukCode || hobliIds.size === 0) {
      return NextResponse.json({ error: `Hobli "${hobli}" was not found in taluk "${taluk}"` }, { status: 404 });
    }

    const features = villages.features
      .filter((feature) => hobliIds.has(String(feature.properties?.KGISHobliI ?? "")))
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          KGISVillageId: feature.properties?.KGISVillag,
          KGISVillageCode: feature.properties?.KGISVill_1,
          KGISVillageName: feature.properties?.KGISVill_2,
          KGISHobliId: feature.properties?.KGISHobliI,
          UniqueVillageCode: feature.properties?.UniqueVill,
          BhoomiVillageCode: feature.properties?.BhoomiVill,
          LGDVillageCode: feature.properties?.LGD_Villag,
        },
      }));

    return NextResponse.json(
      { type: "FeatureCollection", features },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error) {
    console.error("[hobli-villages] Failed to load updated village boundaries:", error);
    return NextResponse.json({ error: "Failed to load village boundaries" }, { status: 500 });
  }
}
