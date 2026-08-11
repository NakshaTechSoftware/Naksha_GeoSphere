import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const bucket = process.env.MINIO_BUCKET ?? "geosphere-source-data";
const client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://192.168.10.81:9010",
  region: process.env.MINIO_REGION ?? "geosphere",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

if (!process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  throw new Error("MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required");
}

const base = "Administrative Boundaries/india/";
const stateBase = `${base}karnataka/`;
const districtsBase = `${stateBase}Districts/`;
const stateDataBase = `${stateBase}KARNATAKA/`;

const readJson = async (relativePath) =>
  JSON.parse(await readFile(path.join(root, relativePath), "utf8"));

const collection = (features) => ({ type: "FeatureCollection", features });
const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/^\d+[-_]/, "")
    .replace(/[()_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const safeName = (value) =>
  String(value ?? "Unknown")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const folderName = (prefix) => prefix.split("/").filter(Boolean).at(-1) ?? "";

async function listFolders(prefix) {
  const folders = [];
  let token;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: token,
      })
    );
    folders.push(...(response.CommonPrefixes ?? []).flatMap((item) => item.Prefix ?? []));
    token = response.NextContinuationToken;
  } while (token);
  return folders;
}

function matchFolder(folders, code, name) {
  const codePrefix = `${code}_`;
  return (
    folders.find((folder) => folderName(folder).startsWith(codePrefix)) ??
    folders.find((folder) => normalize(folderName(folder)) === normalize(name))
  );
}

async function upload(key, body) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof body === "string" ? body : JSON.stringify(body),
      ContentType: "application/geo+json",
    })
  );
  process.stdout.write(`uploaded ${key}\n`);
}

async function uploadMany(jobs, concurrency = 6) {
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      await upload(job.key, job.body);
    }
  });
  await Promise.all(workers);
}

const [india, states, districts, taluks, hoblies] = await Promise.all([
  readJson("frontend/public/data/india_boundary_updated.geojson"),
  readJson("frontend/public/data/india_states_updated.geojson"),
  readJson("District Boundaries/KARNATAKA_DISTRICTS.geojson"),
  readJson("Taluk Boundaries/KARNATAKA_TALUKS.geojson"),
  readJson("Hobli Boundaries/KARNATAKA_HOBLIS.geojson"),
]);

await uploadMany([
  { key: `${base}INDIA_BOUNDARY.geojson`, body: india },
  { key: `${base}INDIA_STATES.geojson`, body: states },
  { key: `${stateDataBase}KARNATAKA_DISTRICTS.geojson`, body: districts },
  { key: `${stateDataBase}KARNATAKA_TALUKS.geojson`, body: taluks },
  { key: `${stateDataBase}KARNATAKA_HOBLIS.geojson`, body: hoblies },
]);

const districtFolders = await listFolders(districtsBase);
const districtJobs = [];
const hierarchy = [];

for (const district of districts.features) {
  const props = district.properties ?? {};
  const districtCode = String(props.district_code ?? "").padStart(2, "0");
  const districtName = String(props.dtname ?? "");
  const existingDistrict = matchFolder(districtFolders, districtCode, districtName);
  const districtPrefix =
    existingDistrict ?? `${districtsBase}${districtCode}_${safeName(districtName)}/`;
  const districtTaluks = taluks.features.filter(
    (feature) =>
      String(feature.properties?.KGISDistrictCode ?? "").padStart(2, "0") === districtCode
  );
  districtJobs.push({
    key: `${districtPrefix}${safeName(districtName)}_subdistrict_boundaries.geojson`,
    body: collection(districtTaluks),
  });
  hierarchy.push({ districtCode, districtName, districtPrefix, taluks: districtTaluks });
}
await uploadMany(districtJobs);

const talukHierarchy = [];
for (const district of hierarchy) {
  let subDistrictRoot = `${district.districtPrefix}SubDistricts/`;
  let existingTalukFolders = await listFolders(subDistrictRoot);
  if (existingTalukFolders.length === 0) {
    const alternate = `${district.districtPrefix}Sub_Districts/`;
    const alternateFolders = await listFolders(alternate);
    if (alternateFolders.length > 0) {
      subDistrictRoot = alternate;
      existingTalukFolders = alternateFolders;
    }
  }
  const jobs = [];
  for (const taluk of district.taluks) {
    const props = taluk.properties ?? {};
    const talukCode = String(props.KGISTalukCode ?? "");
    const talukName = String(props.KGISTalukName ?? "");
    const existingTaluk = matchFolder(existingTalukFolders, talukCode, talukName);
    const talukPrefix =
      existingTaluk ?? `${subDistrictRoot}${talukCode}_${safeName(talukName)}/`;
    const talukHoblies = hoblies.features.filter(
      (feature) => String(feature.properties?.KGISTalukCode ?? "") === talukCode
    );
    jobs.push({
      key: `${talukPrefix}${safeName(talukName)}_hobli_boundary.geojson`,
      body: collection(talukHoblies),
    });
    talukHierarchy.push({
      districtCode: district.districtCode,
      talukCode,
      talukName,
      talukPrefix,
      hoblies: talukHoblies,
    });
  }
  await uploadMany(jobs);
}

const villageByDistrict = new Map();
for (const district of hierarchy) {
  const fileName = `${district.districtCode}_${safeName(district.districtName).replace(
    /_Urban$|_Rural$/,
    (match) => match
  )}.geojson`;
  const candidates = [
    fileName,
    `${district.districtCode}_${safeName(district.districtName.replace(/[()]/g, ""))}.geojson`,
  ];
  let data;
  for (const candidate of candidates) {
    try {
      data = await readJson(`Village Boundaries/GeoJSON/${candidate}`);
      break;
    } catch {
      // Try the actual district-code-prefixed file below.
    }
  }
  if (!data) {
    const { readdir } = await import("node:fs/promises");
    const actual = (await readdir(path.join(root, "Village Boundaries/GeoJSON"))).find((name) =>
      name.startsWith(`${district.districtCode}_`)
    );
    if (actual) data = await readJson(`Village Boundaries/GeoJSON/${actual}`);
  }
  if (data) villageByDistrict.set(district.districtCode, data);
}

let villageFilesUploaded = 0;
for (const taluk of talukHierarchy) {
  const villageData = villageByDistrict.get(taluk.districtCode);
  if (!villageData) continue;
  let hobliRoot = `${taluk.talukPrefix}Hoblis/`;
  let existingHobliFolders = await listFolders(hobliRoot);
  for (const variant of ["Hoblies/", "hoblies/", "hoblis/"]) {
    if (existingHobliFolders.length > 0) break;
    const candidate = `${taluk.talukPrefix}${variant}`;
    const folders = await listFolders(candidate);
    if (folders.length > 0) {
      hobliRoot = candidate;
      existingHobliFolders = folders;
    }
  }

  const grouped = new Map();
  for (const hobli of taluk.hoblies) {
    const props = hobli.properties ?? {};
    const hobliCode = String(props.KGISHobliCode ?? "");
    const key = hobliCode || `${taluk.talukCode}_${normalize(props.KGISHobliName)}`;
    const item = grouped.get(key) ?? {
      hobliCode,
      hobliName: String(props.KGISHobliName ?? ""),
      ids: new Set(),
    };
    item.ids.add(String(props.KGISHobliId ?? ""));
    grouped.set(key, item);
  }

  const jobs = [];
  for (const hobli of grouped.values()) {
    const existingHobli = matchFolder(existingHobliFolders, hobli.hobliCode, hobli.hobliName);
    const hobliPrefix =
      existingHobli ?? `${hobliRoot}${hobli.hobliCode}_${safeName(hobli.hobliName)}/`;
    const villages = villageData.features.filter((feature) =>
      hobli.ids.has(String(feature.properties?.KGISHobliI ?? ""))
    );
    if (villages.length === 0) continue;
    jobs.push({
      key: `${hobliPrefix}${safeName(hobli.hobliName)}_village_boundaries.geojson`,
      body: collection(villages),
    });
  }
  await uploadMany(jobs);
  villageFilesUploaded += jobs.length;
}

process.stdout.write(
  `complete districts=${hierarchy.length} taluks=${talukHierarchy.length} villageFiles=${villageFilesUploaded}\n`
);
