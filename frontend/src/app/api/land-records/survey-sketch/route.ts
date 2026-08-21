import { NextRequest, NextResponse } from "next/server";
import { similarity } from "../../datasets/_folder-match";

const SERVICE84_BASE = "https://rdservices.karnataka.gov.in/Service84/Default/";
const REQUEST_TIMEOUT_MS = 60_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; html: string }>();

/** Parse potentially double/triple-encoded JSON from Service84 endpoints. */
function deeplyParseJson(text: string): unknown {
  let val: unknown = text;
  for (let i = 0; i < 3; i++) {
    if (typeof val !== "string") break;
    try { val = JSON.parse(val); } catch { break; }
  }
  return val;
}

/** Fuzzy-match a name against an array of {NAME: ...} objects. */
function findByName<T extends Record<string, unknown>>(
  items: T[],
  name: string,
  nameKey: string,
): T | undefined {
  const target = name.toLowerCase().replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();
  let best: { item: T; score: number } | undefined;
  for (const item of items) {
    const raw = String(item[nameKey] ?? "");
    const label = raw.includes("/") ? raw.split("/").pop()! : raw;
    const norm = label.toLowerCase().replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();
    const score = similarity(norm, target);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 0.6 ? best.item : undefined;
}

async function postJson(url: string, data: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return deeplyParseJson(await res.text());
}

async function postFormData(
  url: string,
  fd: FormData,
  cookie?: string,
): Promise<{ data: unknown; cookie?: string }> {
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: fd,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const sc = res.headers.getSetCookie?.() ?? [];
  const setCookie = sc.length > 0 ? sc.map((c) => c.split(";")[0]).join("; ") : undefined;
  return { data: deeplyParseJson(await res.text()), cookie: setCookie };
}

type SketchParams = {
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  survey: string;
  surnoc: string;
  hissa: string;
};

async function fetchSketch(p: SketchParams): Promise<string> {
  // Maintain a session cookie across all requests.
  let cookie = "";
  const mergeCookie = (newCookie?: string) => {
    if (!newCookie) return;
    const jar = new Map<string, string>();
    for (const part of cookie.split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq > 0) jar.set(trimmed.substring(0, eq).trim(), trimmed);
    }
    for (const part of newCookie.split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq > 0) jar.set(trimmed.substring(0, eq).trim(), trimmed);
    }
    cookie = [...jar.values()].join("; ");
  };

  // Step 0: Open the main page to get the initial session cookie.
  const initRes = await fetch(SERVICE84_BASE, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  mergeCookie((initRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; "));

  // Step 1: Get districts
  const districts = (await postJson(SERVICE84_BASE + "FillCensusDistrict", {})) as
    { DISTRICT_CODE: number; DISTRICT_NAME: string }[];
  const dist = findByName(districts, p.district, "DISTRICT_NAME");
  if (!dist) throw new Error(`District "${p.district}" not found in Service84 records`);

  // Step 2: Get taluks
  const taluks = (await postJson(SERVICE84_BASE + "FillCensusTALUKA", {
    Districtcode: dist.DISTRICT_CODE,
  })) as { TALUKA_CODE: number; TALUKA_NAME: string }[];
  const taluk = findByName(taluks, p.taluk, "TALUKA_NAME");
  if (!taluk) throw new Error(`Taluk "${p.taluk}" not found in Service84 records`);

  // Step 3: Get hoblis
  const hoblis = (await postJson(SERVICE84_BASE + "FillCensushobli", {
    Districtcode: dist.DISTRICT_CODE,
    talukaCode: taluk.TALUKA_CODE,
  })) as { HOBLI_CODE: number; HOBLI_NAME: string }[];
  const hobli = findByName(hoblis, p.hobli, "HOBLI_NAME");
  if (!hobli) throw new Error(`Hobli "${p.hobli}" not found in Service84 records`);

  // Step 4: Get villages
  const villages = (await postJson(SERVICE84_BASE + "FillCensusvillege", {
    Districtcode: dist.DISTRICT_CODE,
    talukaCode: taluk.TALUKA_CODE,
    hobliCode: hobli.HOBLI_CODE,
  })) as { VILLAGE_CODE: string | number; VILLAGE_NAME: string }[];
  const village = findByName(villages, p.village, "VILLAGE_NAME");
  if (!village) throw new Error(`Village "${p.village}" not found in Service84 records`);

  const villageValue = String(village.VILLAGE_CODE);
  const bhmvlg = villageValue.split("_")[0] ?? villageValue;

  // Step 5: Get surnoc
  let fd = new FormData();
  fd.append("Dist", String(dist.DISTRICT_CODE));
  fd.append("Taluk", String(taluk.TALUKA_CODE));
  fd.append("Hobli", String(hobli.HOBLI_CODE));
  fd.append("Village", bhmvlg);
  fd.append("Surveyno", p.survey);
  const surnocResult = await postFormData(SERVICE84_BASE + "GetSurnoc", fd, cookie);
  mergeCookie(surnocResult.cookie);
  const surnocs = surnocResult.data as { surnoc: string }[];
  if (!Array.isArray(surnocs) || surnocs.length === 0) {
    throw new Error(`No surnoc data for survey "${p.survey}"`);
  }
  const surnocValue = p.surnoc === "*" || p.surnoc.toUpperCase() === "XX"
    ? String(surnocs[0]!.surnoc)
    : p.surnoc;

  // Step 6: Get hissa
  fd = new FormData();
  fd.append("surnoc", surnocValue);
  const hissaResult = await postFormData(SERVICE84_BASE + "GetHissaNo", fd, cookie);
  mergeCookie(hissaResult.cookie);
  const hissas = hissaResult.data as { hissa_no: string }[];
  if (!Array.isArray(hissas) || hissas.length === 0) {
    throw new Error(`No hissa data for surnoc "${surnocValue}"`);
  }
  const hissaValue = p.hissa === "*" || p.hissa.toUpperCase() === "XX"
    ? String(hissas[0]!.hissa_no)
    : p.hissa;

  // Step 7: GetRTCDataforSearch — sets up session state for sketch
  fd = new FormData();
  fd.append("Dist", String(dist.DISTRICT_CODE));
  fd.append("Taluk", String(taluk.TALUKA_CODE));
  fd.append("Hobli", String(hobli.HOBLI_CODE));
  fd.append("Village", bhmvlg);
  fd.append("Surveyno", p.survey);
  fd.append("Surnoc", surnocValue);
  fd.append("Hissano", hissaValue);
  const rtcResult = await postFormData(SERVICE84_BASE + "GetRTCDataforSearch", fd, cookie);
  mergeCookie(rtcResult.cookie);

  // Step 8: GetSelectedPolygonView — returns the sketch HTML
  fd = new FormData();
  fd.append("Surnoc", surnocValue);
  fd.append("Hissano", hissaValue);
  const sketchResult = await postFormData(SERVICE84_BASE + "GetSelectedPolygonView", fd, cookie);

  const html = String(sketchResult.data ?? "");
  if (!html || html === "Nodata" || html === "Exception") {
    throw new Error("No sketch data available for this parcel");
  }
  return html;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const params: SketchParams = {
    district: q.get("district") ?? "",
    taluk: q.get("taluk") ?? "",
    hobli: q.get("hobli") ?? "",
    village: q.get("village") ?? "",
    survey: q.get("survey") ?? "",
    surnoc: q.get("surnoc") ?? "*",
    hissa: q.get("hissa") ?? "*",
  };
  const missing = (["district", "taluk", "hobli", "village", "survey"] as const).filter(
    (k) => !params[k].trim(),
  );
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });
  }

  const key = Object.values(params).join("|").toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ sketchHtml: hit.html, cached: true });
  }

  try {
    const html = await fetchSketch(params);
    cache.set(key, { at: Date.now(), html });
    return NextResponse.json({ sketchHtml: html });
  } catch (error) {
    console.error("[land-records/survey-sketch] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch survey sketch", message: error instanceof Error ? error.message : "Unknown" },
      { status: 502 },
    );
  }
}
