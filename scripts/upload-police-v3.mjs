import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import sdk from "../frontend/node_modules/@aws-sdk/client-s3/dist-cjs/index.js";
const { S3Client, PutObjectCommand } = sdk;

const source = resolve(process.argv[2] ?? "POLICE/Karnataka Police Complete V3/Karnataka");
const prefix = "Police Station Boundaries/V3/Karnataka";
const bucket = "geosphere-source-data";
const client = new S3Client({
  endpoint: "http://192.168.10.81:9010",
  region: "geosphere",
  forcePathStyle: true,
  credentials: {
    accessKeyId: "geosphere_storage",
    secretAccessKey: "706f803f67c143c884305e7085b59210ffb29ac69e724a70",
  },
});

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else if (entry.name.toLowerCase().endsWith(".geojson")) result.push(path);
  }
  return result;
}

const files = await filesUnder(source);
let uploaded = 0;
for (const path of files) {
  const key = `${prefix}/${relative(source, path).split(sep).join("/")}`;
  const size = (await stat(path)).size;
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(path),
    ContentLength: size,
    ContentType: "application/geo+json",
  }));
  uploaded += 1;
  console.log(`[${uploaded}/${files.length}] ${key}`);
}
console.log(`Uploaded ${uploaded} police GeoJSON files to ${bucket}/${prefix}/`);
