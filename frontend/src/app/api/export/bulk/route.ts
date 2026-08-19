import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { parseUpstreamError } from "../_error";
import { booleanIntersects, featureCollection, union } from "@turf/turf";

// Walks the admin hierarchy (State -> District -> Taluk -> Hobli -> Village) starting from
// whatever the user right-clicked, using this app's own MinIO-backed drill-down routes
// (state-districts / district-taluks / taluk-hoblies / hobli-villages) - the same ones the
// map itself uses to load each level - then hands the assembled features to the FastAPI
// backend for GDAL/OGR conversion. Streams progress as Server-Sent Events since a deep
// bulk export (e.g. every village in a district) can take a while.

type BulkLevel = "state" | "district" | "taluk" | "hobli" | "village" | "survey_plot";
type AdminLevel = BulkLevel;
// The levels actually fetched from a named MinIO-backed dataset route. "state" has no such
// route of its own - its output feature is assembled by dissolving every district instead
// (see dissolveState below), so it's excluded from the maps keyed by fetch mechanics.
type FetchableLevel = Exclude<BulkLevel, "state">;
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
  aoiGeometry?: unknown;
}

const NAME_KEYS: Record<FetchableLevel, string[]> = {
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

const ROUTE_BY_LEVEL: Record<FetchableLevel, string> = {
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

// "state" has no boundary dataset of its own - it's assembled by dissolving every district
// already fetched for the state-wide walk into one polygon, the same way the map's own
// India-boundary layer is described as "dissolved from" its constituent state/UT polygons.
// Real KGIS district data isn't always topologically clean (see the worker's export.py note
// that roughly a third of Karnataka's districts fail strict OGC validity), which can make
// turf's boolean-clipping union throw - return null rather than failing the whole export,
// the other selected levels still make a legitimate download.
function dissolveState(districts: GeoJSON.Feature[], stateName: string): GeoJSON.Feature | null {
  const polygons = districts.filter(
    (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
      f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
  );
  if (polygons.length === 0) return null;
  try {
    return union(featureCollection(polygons), { properties: { name: stateName } });
  } catch {
    return null;
  }
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
  level: FetchableLevel,
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
  level: FetchableLevel,
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
    if (need("state")) {
      emit("Assembling state boundary…");
      const stateFeature = dissolveState(all, state);
      if (stateFeature) layers.state = [stateFeature];
    }
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
const BULK_LEVELS: BulkLevel[] = ["state", "district", "taluk", "hobli", "village", "survey_plot"];

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
      // The hierarchy walk emits progress from several concurrent workers; a
      // worker can still be mid-emit when an error (or the done event) closes
      // the stream. Enqueueing after close throws, so gate every send on this
      // flag and swallow the first enqueue error.
      let streamClosed = false;
      const send = (event: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          streamClosed = true;
        }
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

        // When an AOI geometry is provided, filter every layer to only features
        // that spatially intersect the drawn polygon.
        const aoiPoly = body.aoiGeometry && typeof body.aoiGeometry === "object"
          ? body.aoiGeometry as GeoJSON.Polygon
          : null;
        if (aoiPoly) {
          send({ type: "progress", message: "Clipping to drawn area…" });
          for (const key of Object.keys(layers) as BulkLevel[]) {
            const feats = layers[key];
            if (!feats) continue;
            layers[key] = feats.filter((f) => {
              try {
                return f.geometry && booleanIntersects(f as any, aoiPoly as any);
              } catch {
                return false;
              }
            });
          }
        }

        const layerPayload = Object.entries(layers)
          .filter(([, features]) => features && features.length > 0)
          .map(([level, features]) => ({ level, features }));

        if (layerPayload.length === 0) {
          send({ type: "error", message: "No boundaries found for the selected levels" });
          controller.close();
          return;
        }

        send({ type: "progress", message: "Preparing file…" });

        // A whole-district export can be hundreds of MB of GeoJSON - far past what a
        // single JSON.stringify() call can safely produce (V8 has a hard ~512MB
        // per-string limit; a district-wide survey-plot layer alone can exceed it).
        // Stage every feature as its own tiny NDJSON line instead of one giant request
        // body, streamed straight to the backend without ever holding the whole
        // payload as one string in this process.
        const stageBody = new ReadableStream<Uint8Array>({
          start(stageController) {
            for (const { level, features } of layerPayload) {
              for (const feature of features) {
                stageController.enqueue(encoder.encode(`${JSON.stringify({ level, feature })}\n`));
              }
            }
            stageController.close();
          },
        });

        const staged = await fetch(`${config.internalApiUrl}/api/v1/export/bulk/stage`, {
          method: "POST",
          headers: { "Content-Type": "application/x-ndjson" },
          body: stageBody,
          // Required by Node's fetch (undici) whenever the request body is a stream.
          duplex: "half",
          cache: "no-store",
        } as RequestInit & { duplex: "half" });

        if (!staged.ok) {
          const message = await parseUpstreamError(staged, staged.status);
          send({ type: "error", message });
          controller.close();
          return;
        }
        const { staged_key: stagedKey } = (await staged.json()) as { staged_key: string };

        // The finished file itself never comes back through this response either -
        // same string-length ceiling, same fix: get back just where it lives, and let
        // the browser download it directly from a dedicated route below.
        const upstream = await fetch(`${config.internalApiUrl}/api/v1/export/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            export_format: exportFormat,
            staged_key: stagedKey,
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

        const result = (await upstream.json()) as { key: string; filename: string; mimetype: string };

        send({
          type: "done",
          filename: result.filename,
          mimetype: result.mimetype,
          downloadUrl: `/api/export/bulk/download?key=${encodeURIComponent(result.key)}`,
        });
      } catch (error) {
        console.error("[export/bulk] failed:", error);
        send({ type: "error", message: error instanceof Error ? error.message : "Export failed" });
      } finally {
        streamClosed = true;
        try {
          controller.close();
        } catch {
          /* already closed (client aborted) - nothing more to send */
        }
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
