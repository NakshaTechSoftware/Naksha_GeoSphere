import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { parseUpstreamError } from "../_error";

// Walks the admin hierarchy (District -> Taluk -> Hobli -> Village) starting from whatever
// the user right-clicked, using this app's own MinIO-backed drill-down routes
// (state-districts / district-taluks / taluk-hoblies / hobli-villages) - the same ones the
// map itself uses to load each level - then hands the assembled features to the FastAPI
// backend for GDAL/OGR conversion. Streams progress as Server-Sent Events since a deep
// bulk export (e.g. every village in a district) can take a while.

type BulkLevel = "district" | "taluk" | "hobli" | "village" | "survey_plot";
type AdminLevel = "state" | BulkLevel;
const EXPORT_FORMATS = ["geojson", "shapefile", "kml", "kmz", "gpkg", "gdb", "csv"] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

interface BulkRequestBody {
  exportFormat?: unknown;
  state?: unknown;
  district?: unknown;
  taluk?: unknown;
  hobli?: unknown;
  village?: unknown;
  clickedLevel?: unknown;
  selectedLevels?: unknown;
  nameHint?: unknown;
}

const NAME_KEYS: Record<BulkLevel, string[]> = {
  district: ["dtname"],
  taluk: ["KGISTalukName", "subdist_nm", "name", "taluk_name", "TALUK_NAME", "TalukName"],
  hobli: ["KGISHobliName", "hobli_name", "name"],
  village: [
    "KGISVillageName",
    "village_name",
    "Village_Name",
    "vill_nm",
    "village",
    "vname",
    "VILLNAME",
    "name",
  ],
  survey_plot: ["Surveynumber_Old", "surveynumberi", "survey_no", "survey_number"],
};

const ROUTE_BY_LEVEL: Record<BulkLevel, string> = {
  district: "state-districts",
  taluk: "district-taluks",
  hobli: "taluk-hoblies",
  village: "hobli-villages",
  survey_plot: "village-cadastrals",
};

const FETCH_CONCURRENCY = 6;

function nameFromFeature(feature: GeoJSON.Feature, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = (feature.properties as Record<string, unknown> | null)?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function uniqueNames(features: GeoJSON.Feature[], keys: string[]): string[] {
  const seen = new Set<string>();
  for (const feature of features) {
    const name = nameFromFeature(feature, keys);
    if (name) seen.add(name);
  }
  return [...seen];
}

// Some MinIO boundary files embed a stray record from a different level (e.g. the
// district's own boundary shows up as an extra row inside its own district-taluks file) -
// keep only features that actually carry this level's own name key, so a bulk-exported
// layer never mixes in a feature that isn't really that level.
function keepNamed(features: GeoJSON.Feature[], keys: string[]): GeoJSON.Feature[] {
  return features.filter((f) => nameFromFeature(f, keys) !== undefined);
}

function filterByName(features: GeoJSON.Feature[], keys: string[], target: string): GeoJSON.Feature[] {
  const wanted = target.trim().toLowerCase();
  return features.filter((f) => (nameFromFeature(f, keys) ?? "").toLowerCase() === wanted);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await fn(item, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return results;
}

async function fetchLevel(
  origin: string,
  level: BulkLevel,
  params: Record<string, string | undefined>
): Promise<GeoJSON.Feature[]> {
  const url = new URL(`/api/datasets/${ROUTE_BY_LEVEL[level]}`, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${ROUTE_BY_LEVEL[level]} failed (${res.status})`);
  }
  const collection = await res.json();
  return Array.isArray(collection?.features) ? collection.features : [];
}

// Real KGIS coverage is uneven - plenty of taluks/hoblis have boundary shapefiles but no
// hobli/village file uploaded yet (see HOBLI_BOUNDARY_FIX.md). One missing branch shouldn't
// abort a whole-district/whole-state export, so sibling expansion swallows a failed fetch
// and reports it as skipped instead of throwing.
async function fetchLevelTolerant(
  origin: string,
  level: BulkLevel,
  params: Record<string, string | undefined>
): Promise<{ features: GeoJSON.Feature[]; skipped: boolean }> {
  try {
    return { features: await fetchLevel(origin, level, params), skipped: false };
  } catch {
    return { features: [], skipped: true };
  }
}

interface WalkParams {
  origin: string;
  state: string;
  district?: string;
  taluk?: string;
  hobli?: string;
  village?: string;
  clickedLevel: AdminLevel;
  selectedLevels: BulkLevel[];
  emit: (message: string, current?: number, total?: number) => void;
}

async function collectLayers(
  opts: WalkParams
): Promise<Partial<Record<BulkLevel, GeoJSON.Feature[]>>> {
  const { origin, state, clickedLevel, selectedLevels, emit } = opts;
  const need = (level: BulkLevel) => selectedLevels.includes(level);
  const layers: Partial<Record<BulkLevel, GeoJSON.Feature[]>> = {};

  // --- District scope: which district(s) to walk into for taluks/hoblis/villages, plus
  // the "district" output layer itself if it was requested. ---
  let districtNames: string[] = [];
  if (clickedLevel === "state") {
    emit("Fetching districts…");
    const all = keepNamed(await fetchLevel(origin, "district", { state }), NAME_KEYS.district);
    districtNames = uniqueNames(all, NAME_KEYS.district);
    if (need("district")) layers.district = all;
  } else {
    districtNames = [opts.district!];
    if (need("district")) {
      emit(`Fetching ${opts.district}…`);
      const all = await fetchLevel(origin, "district", { state });
      layers.district = filterByName(all, NAME_KEYS.district, opts.district!);
    }
  }

  if (!need("taluk") && !need("hobli") && !need("village") && !need("survey_plot")) return layers;

  // --- Taluk scope ---
  let talukContexts: { district: string; taluk: string }[] = [];
  if (
    clickedLevel === "taluk" ||
    clickedLevel === "hobli" ||
    clickedLevel === "village" ||
    clickedLevel === "survey_plot"
  ) {
    talukContexts = [{ district: opts.district!, taluk: opts.taluk! }];
    if (need("taluk")) {
      emit(`Fetching ${opts.taluk}…`);
      const all = await fetchLevel(origin, "taluk", { state, district: opts.district });
      layers.taluk = filterByName(all, NAME_KEYS.taluk, opts.taluk!);
    }
  } else {
    const talukLayer: GeoJSON.Feature[] = [];
    let done = 0;
    let skipped = 0;
    const results = await mapWithConcurrency(districtNames, FETCH_CONCURRENCY, async (districtName) => {
      const { features, skipped: wasSkipped } = await fetchLevelTolerant(origin, "taluk", {
        state,
        district: districtName,
      });
      done += 1;
      if (wasSkipped) skipped += 1;
      emit(`Fetching taluks… (${done}/${districtNames.length})`, done, districtNames.length);
      return { districtName, features };
    });
    for (const { districtName, features } of results) {
      const realTaluks = keepNamed(features, NAME_KEYS.taluk);
      talukLayer.push(...realTaluks);
      for (const name of uniqueNames(realTaluks, NAME_KEYS.taluk)) {
        talukContexts.push({ district: districtName, taluk: name });
      }
    }
    if (need("taluk")) layers.taluk = talukLayer;
    if (skipped > 0) emit(`Skipped ${skipped} district(s) with no taluk data`);
  }

  if (!need("hobli") && !need("village") && !need("survey_plot")) return layers;

  // --- Hobli scope ---
  let hobliContexts: { district: string; taluk: string; hobli: string }[] = [];
  if (clickedLevel === "hobli" || clickedLevel === "village" || clickedLevel === "survey_plot") {
    hobliContexts = [{ district: opts.district!, taluk: opts.taluk!, hobli: opts.hobli! }];
    if (need("hobli")) {
      emit(`Fetching ${opts.hobli}…`);
      const all = await fetchLevel(origin, "hobli", {
        state,
        district: opts.district,
        taluk: opts.taluk,
      });
      layers.hobli = filterByName(all, NAME_KEYS.hobli, opts.hobli!);
    }
  } else {
    const hobliLayer: GeoJSON.Feature[] = [];
    let done = 0;
    let skipped = 0;
    const results = await mapWithConcurrency(talukContexts, FETCH_CONCURRENCY, async (t) => {
      const { features, skipped: wasSkipped } = await fetchLevelTolerant(origin, "hobli", {
        state,
        district: t.district,
        taluk: t.taluk,
      });
      done += 1;
      if (wasSkipped) skipped += 1;
      emit(`Fetching hoblis… (${done}/${talukContexts.length})`, done, talukContexts.length);
      return { ...t, features };
    });
    for (const r of results) {
      const realHoblis = keepNamed(r.features, NAME_KEYS.hobli);
      hobliLayer.push(...realHoblis);
      for (const name of uniqueNames(realHoblis, NAME_KEYS.hobli)) {
        hobliContexts.push({ district: r.district, taluk: r.taluk, hobli: name });
      }
    }
    if (need("hobli")) layers.hobli = hobliLayer;
    if (skipped > 0) emit(`Skipped ${skipped} taluk(s) with no hobli data`);
  }

  if (!need("village") && !need("survey_plot")) return layers;

  // --- Village scope ---
  // A village/survey-plot click narrows to the single clicked village; any higher click
  // expands every hobli in scope. The village contexts are kept so the survey-plot walk
  // below knows exactly which village each cadastral file belongs to.
  let villageContexts: { district: string; taluk: string; hobli: string; village: string }[] = [];
  if (clickedLevel === "village" || clickedLevel === "survey_plot") {
    villageContexts = [
      {
        district: opts.district!,
        taluk: opts.taluk!,
        hobli: opts.hobli!,
        village: opts.village!,
      },
    ];
    if (need("village")) {
      emit(`Fetching ${opts.village}…`);
      const all = await fetchLevel(origin, "village", {
        state,
        district: opts.district,
        taluk: opts.taluk,
        hobli: opts.hobli,
      });
      layers.village = filterByName(all, NAME_KEYS.village, opts.village!);
    }
  } else {
    const villageLayer: GeoJSON.Feature[] = [];
    let done = 0;
    let skippedVillages = 0;
    const results = await mapWithConcurrency(hobliContexts, FETCH_CONCURRENCY, async (h) => {
      const { features, skipped: wasSkipped } = await fetchLevelTolerant(origin, "village", {
        state,
        district: h.district,
        taluk: h.taluk,
        hobli: h.hobli,
      });
      done += 1;
      if (wasSkipped) skippedVillages += 1;
      emit(`Fetching villages… (${done}/${hobliContexts.length})`, done, hobliContexts.length);
      return { ...h, features };
    });
    for (const r of results) {
      const realVillages = keepNamed(r.features, NAME_KEYS.village);
      villageLayer.push(...realVillages);
      for (const name of uniqueNames(realVillages, NAME_KEYS.village)) {
        villageContexts.push({ district: r.district, taluk: r.taluk, hobli: r.hobli, village: name });
      }
    }
    if (need("village")) layers.village = villageLayer;
    if (skippedVillages > 0) emit(`Skipped ${skippedVillages} hobli(s) with no village data`);
  }

  if (!need("survey_plot")) return layers;

  // --- Survey plot scope: leaf level, one village-cadastrals fetch per village. ---
  const surveyPlotLayer: GeoJSON.Feature[] = [];
  let donePlots = 0;
  let skippedPlots = 0;
  const plotResults = await mapWithConcurrency(
    villageContexts,
    FETCH_CONCURRENCY,
    async (v) => {
      const { features, skipped: wasSkipped } = await fetchLevelTolerant(origin, "survey_plot", {
        state,
        district: v.district,
        taluk: v.taluk,
        hobli: v.hobli,
        village: v.village,
      });
      donePlots += 1;
      if (wasSkipped) skippedPlots += 1;
      emit(
        `Fetching survey plots… (${donePlots}/${villageContexts.length})`,
        donePlots,
        villageContexts.length
      );
      return features;
    }
  );
  for (const features of plotResults) {
    surveyPlotLayer.push(...keepNamed(features, NAME_KEYS.survey_plot));
  }
  layers.survey_plot = surveyPlotLayer;
  if (skippedPlots > 0) emit(`Skipped ${skippedPlots} village(s) with no survey plot data`);

  return layers;
}

function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

const ADMIN_LEVELS: AdminLevel[] = ["state", "district", "taluk", "hobli", "village", "survey_plot"];
const BULK_LEVELS: BulkLevel[] = ["district", "taluk", "hobli", "village", "survey_plot"];

export async function POST(request: NextRequest) {
  let body: BulkRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body must be JSON" }), { status: 400 });
  }

  if (!isExportFormat(body.exportFormat)) {
    return new Response(
      JSON.stringify({ error: `exportFormat must be one of: ${EXPORT_FORMATS.join(", ")}` }),
      { status: 400 }
    );
  }
  if (typeof body.state !== "string" || !body.state.trim()) {
    return new Response(JSON.stringify({ error: "state is required" }), { status: 400 });
  }
  if (typeof body.clickedLevel !== "string" || !ADMIN_LEVELS.includes(body.clickedLevel as AdminLevel)) {
    return new Response(JSON.stringify({ error: "clickedLevel is invalid" }), { status: 400 });
  }
  const clickedLevel = body.clickedLevel as AdminLevel;
  const selectedLevels = Array.isArray(body.selectedLevels)
    ? (body.selectedLevels.filter((l) => BULK_LEVELS.includes(l)) as BulkLevel[])
    : [];
  if (selectedLevels.length === 0) {
    return new Response(JSON.stringify({ error: "selectedLevels must include at least one level" }), {
      status: 400,
    });
  }
  const district = typeof body.district === "string" ? body.district : undefined;
  const taluk = typeof body.taluk === "string" ? body.taluk : undefined;
  const hobli = typeof body.hobli === "string" ? body.hobli : undefined;
  const village = typeof body.village === "string" ? body.village : undefined;
  if (clickedLevel !== "state" && !district) {
    return new Response(JSON.stringify({ error: "district is required for this clickedLevel" }), {
      status: 400,
    });
  }
  if (
    clickedLevel === "taluk" ||
    clickedLevel === "hobli" ||
    clickedLevel === "village" ||
    clickedLevel === "survey_plot"
  ) {
    if (!taluk) {
      return new Response(JSON.stringify({ error: "taluk is required for this clickedLevel" }), {
        status: 400,
      });
    }
  }
  if ((clickedLevel === "hobli" || clickedLevel === "village") && !hobli) {
    return new Response(JSON.stringify({ error: "hobli is required for this clickedLevel" }), {
      status: 400,
    });
  }
  if ((clickedLevel === "village" || clickedLevel === "survey_plot") && !village) {
    return new Response(JSON.stringify({ error: "village is required for this clickedLevel" }), {
      status: 400,
    });
  }

  const exportFormat = body.exportFormat;
  const nameHint = typeof body.nameHint === "string" && body.nameHint.trim() ? body.nameHint : "export";
  const origin = request.nextUrl.origin;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const layers = await collectLayers({
          origin,
          state: body.state as string,
          district,
          taluk,
          hobli,
          village,
          clickedLevel,
          selectedLevels,
          emit: (message, current, total) => send({ type: "progress", message, current, total }),
        });

        const layerPayload = Object.entries(layers)
          .filter(([, features]) => features && features.length > 0)
          .map(([level, features]) => ({ level, features }));

        if (layerPayload.length === 0) {
          send({ type: "error", message: "No boundaries found for the selected levels" });
          controller.close();
          return;
        }

        send({ type: "progress", message: "Preparing file…" });

        const upstream = await fetch(`${config.apiUrl}/api/v1/export/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            export_format: exportFormat,
            layers: layerPayload,
            name_hint: nameHint,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(280_000),
        });

        if (!upstream.ok) {
          const message = await parseUpstreamError(upstream, upstream.status);
          send({ type: "error", message });
          controller.close();
          return;
        }

        const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";
        const disposition = upstream.headers.get("Content-Disposition") ?? "";
        const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${nameHint}.export`;
        const buffer = Buffer.from(await upstream.arrayBuffer());

        send({
          type: "done",
          filename,
          mimetype: contentType,
          contentBase64: buffer.toString("base64"),
        });
      } catch (error) {
        console.error("[export/bulk] failed:", error);
        send({ type: "error", message: error instanceof Error ? error.message : "Export failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
