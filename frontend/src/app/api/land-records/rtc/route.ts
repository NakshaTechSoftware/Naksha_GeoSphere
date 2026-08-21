import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { dropdownOptions, matchOption, parseOwners, type RtcOwner, type RtcUseCase } from "../_bhoomi";

// tesseract.js's default `workerPath` is computed from `__dirname` inside its own package
// files, which Next.js's dev-server module loader rewrites for traced/external packages -
// leading it to look for the worker script under `.next/worker-script/node/index.js` (which
// doesn't exist) instead of its real location in node_modules. Resolving from
// `process.cwd()` (the project root in both dev and the standalone Docker build) sidesteps
// that entirely.
function tesseractWorkerPath(): string {
  return path.join(process.cwd(), "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js");
}

const BHOOMI_URL = "https://landrecords.karnataka.gov.in/Service2/";
const PREVIEW_RTC_URL = "https://landrecords.karnataka.gov.in/Service2/PreviewRTC.aspx";
const PREFIX = "ctl00$MainContent$";
const REQUEST_TIMEOUT_MS = 90_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  at: number;
  owners: RtcOwner[];
  useCase?: RtcUseCase;
}
const cache = new Map<string, CacheEntry>();

type ParcelParams = {
  district: string; taluk: string; hobli: string; village: string;
  survey: string; surnoc: string; hissa: string;
};

class BhoomiSession {
  cookie = "";
  html = "";

  /** Parse Set-Cookie headers and merge into our cookie jar. */
  private captureCookies(headers: Headers) {
    const sc = headers.getSetCookie?.() ?? [];
    if (sc.length > 0) {
      // Merge: keep existing cookies, overwrite any that appear in the new set
      const jar = new Map<string, string>();
      // Parse existing
      for (const part of this.cookie.split(";")) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf("=");
        if (eq > 0) jar.set(trimmed.substring(0, eq).trim(), trimmed);
      }
      // Parse new
      for (const c of sc) {
        const nameValue = c.split(";")[0]!.trim();
        const eq = nameValue.indexOf("=");
        if (eq > 0) jar.set(nameValue.substring(0, eq).trim(), nameValue);
      }
      this.cookie = [...jar.values()].join("; ");
    }
  }

  async open() {
    const res = await fetch(BHOOMI_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.captureCookies(res.headers);
    this.html = await res.text();
    console.log("[bhoomi] Session opened, cookie length:", this.cookie.length);
  }

  async post(extra: Record<string, string>, step = "postback") {
    const body = new URLSearchParams({
      __EVENTTARGET: "", __EVENTARGUMENT: "",
      __VIEWSTATE: this.hidden("__VIEWSTATE"),
      __VIEWSTATEGENERATOR: this.hidden("__VIEWSTATEGENERATOR"),
      __VIEWSTATEENCRYPTED: "",
      __EVENTVALIDATION: this.hidden("__EVENTVALIDATION"),
      ...extra,
    });
    const res = await fetch(BHOOMI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        Cookie: this.cookie,
        Referer: BHOOMI_URL,
      },
      body, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((e) => { throw new Error(`Bhoomi "${step}" failed: ${e.message}`); });
    if (!res.ok) throw new Error(`Bhoomi "${step}" returned ${res.status}`);
    this.captureCookies(res.headers);
    this.html = await res.text();
  }

  /**
   * POST btnCPreview using a regular full-page postback (not AJAX delta).
   * This mirrors what happens when the browser submits the form.
   * Returns the full HTML response.
   */
  async previewPost(formFields: Record<string, string>, step = "preview") {
    const body = new URLSearchParams({
      __EVENTTARGET: "", __EVENTARGUMENT: "",
      __VIEWSTATE: this.hidden("__VIEWSTATE"),
      __VIEWSTATEGENERATOR: this.hidden("__VIEWSTATEGENERATOR"),
      __VIEWSTATEENCRYPTED: "",
      __EVENTVALIDATION: this.hidden("__EVENTVALIDATION"),
      [`${PREFIX}btnCPreview`]: "View",
    });
    // Merge all form values
    for (const [k, v] of Object.entries(formFields)) {
      body.set(k, v);
    }
    const res = await fetch(BHOOMI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        Cookie: this.cookie,
        Referer: BHOOMI_URL,
      },
      body, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((e) => { throw new Error(`Bhoomi "${step}" failed: ${e.message}`); });
    if (!res.ok) throw new Error(`Bhoomi "${step}" returned ${res.status}`);
    this.captureCookies(res.headers);
    this.html = await res.text();
    return this.html;
  }

  hidden(name: string): string {
    return (this.html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] ?? "";
  }

  options(id: string) { return dropdownOptions(this.html, id); }
  getCookie() { return this.cookie; }
}

async function prepareSurvey(p: ParcelParams) {
  const session = new BhoomiSession();
  await session.open();
  const form: Record<string, string> = { [`${PREFIX}txtCSurveyNo`]: "" };
  const step = async (control: string, name: string, label: string) => {
    const value = matchOption(session.options(control), name);
    if (!value) throw new Error(`${label} "${name}" not found in Bhoomi records`);
    form[PREFIX + control] = value;
    await session.post({ ...form, __EVENTTARGET: PREFIX + control }, label);
  };
  await step("ddlCDistrict", p.district, "District");
  await step("ddlCTaluk", p.taluk, "Taluk");
  await step("ddlCHobli", p.hobli, "Hobli");
  await step("ddlCVillage", p.village, "Village");
  form[`${PREFIX}txtCSurveyNo`] = p.survey;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}txtCSurveyNo` }, "survey number");
  await session.post({ ...form, [`${PREFIX}btnCGo`]: "Go" }, "Go");
  return { session, form };
}

async function prepareSurnoc(p: ParcelParams, surnoc: { value: string; text: string }) {
  const prepared = await prepareSurvey(p);
  const current = prepared.session.options("ddlCSurnocNo").find((o) => o.value === surnoc.value)
    ?? prepared.session.options("ddlCSurnocNo").find((o) => matchOption([o], surnoc.text) === o.value);
  if (!current) throw new Error(`Surnoc "${surnoc.text}" not found`);
  prepared.form[`${PREFIX}ddlCSurnocNo`] = current.value;
  await prepared.session.post({ ...prepared.form, __EVENTTARGET: `${PREFIX}ddlCSurnocNo` }, `Surnoc ${current.text}`);
  return prepared;
}

/**
 * After "Fetch details" succeeds, fetch the RTC Preview page for land-use data.
 * Flow:
 *   1. POST btnCPreview → server prepares RTC in session
 *   2. GET PreviewRTC.aspx → returns HTML with <img> pointing to a server-rendered PNG
 *   3. Download the PNG image
 *   4. OCR with Kannada language to extract form text
 *   5. Parse OCR text for soil type, crop, irrigation, patta type
 */
async function fetchRtcPreview(session: BhoomiSession, form: Record<string, string>): Promise<RtcUseCase | undefined> {
  console.log("[land-records/rtc] fetchRtcPreview called, cookie length:", session.getCookie().length);

  // Step 1: POST btnCPreview
  try {
    await session.previewPost(form, "btnCPreview");
    console.log("[land-records/rtc] ✓ btnCPreview POST done");
  } catch (err) {
    console.warn("[land-records/rtc] ✗ btnCPreview failed:", err);
  }

  // Step 2: GET PreviewRTC.aspx → extract image URL
  let rtcImageUrl = "";
  try {
    const res = await fetch(PREVIEW_RTC_URL, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: session.getCookie(), Referer: BHOOMI_URL },
      cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      const html = await res.text();
      // Extract image URL — look for img src containing RTCPreview or .png
      const imgMatch = html.match(/<img[^>]*src="([^"]*(?:RTCPreview|Preview)[^"]*\.png)"/i)
        || html.match(/<img[^>]*id="ImgSketchPage"[^>]*src="([^"]+)"/i)
        || html.match(/<img[^>]*src="([^"]*service2images[^"]+)"/i);
      if (imgMatch) {
        rtcImageUrl = imgMatch[1]!.startsWith("http") ? imgMatch[1]! : `https://landrecords.karnataka.gov.in${imgMatch[1]!.startsWith("/") ? "" : "/"}${imgMatch[1]}`;
        console.log("[land-records/rtc] ✓ RTC image URL:", rtcImageUrl);
      } else {
        console.warn("[land-records/rtc] ✗ No RTC image found in PreviewRTC.aspx");
      }
    }
  } catch (err) {
    console.warn("[land-records/rtc] ✗ PreviewRTC GET failed:", err);
  }

  if (!rtcImageUrl) return undefined;

  // Step 3: Download the RTC PNG image
  let imageBuffer: Buffer | undefined;
  try {
    const imgRes = await fetch(rtcImageUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: session.getCookie(), Referer: PREVIEW_RTC_URL },
      cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (imgRes.ok) {
      const ab = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(ab);
      console.log("[land-records/rtc] ✓ RTC image downloaded:", imageBuffer.length, "bytes");
    }
  } catch (err) {
    console.warn("[land-records/rtc] ✗ RTC image download failed:", err);
  }

  if (!imageBuffer) return { landClassification: "Unknown", summary: "RTC image available but could not be downloaded", imageUrl: rtcImageUrl };

  const rawBuffer = imageBuffer;

  // Step 3b: Preprocess the scanned form (upscale + grayscale + threshold) — Bhoomi's
  // RTC PNG is rendered small and lightly anti-aliased, which tesseract reads poorly for
  // Kannada glyphs. Upscaling and binarizing sharpens character edges considerably.
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(imageBuffer).metadata();
    const scale = meta.width && meta.width < 2000 ? 3 : 2;
    imageBuffer = await sharp(imageBuffer)
      .resize({ width: (meta.width ?? 1000) * scale, kernel: "lanczos3" })
      .grayscale()
      .normalize()
      .sharpen()
      .threshold(160)
      .png()
      .toBuffer();
    console.log("[land-records/rtc] ✓ Preprocessed RTC image for OCR:", imageBuffer.length, "bytes");
  } catch (err) {
    console.warn("[land-records/rtc] ✗ Image preprocessing failed, using original:", err instanceof Error ? err.stack : err);
  }

  // Step 3c: Isolate and OCR the Section 5 "soil sample" cell on its own. On this form
  // template that label sits in a fixed spot near the top-left, in a bold serif-ish font
  // that the whole-page pass (PSM 6, kan+eng) reliably drops entirely — cropping just that
  // cell and reading it alone with PSM 7 (single line) recovers it in practice.
  let soilCellText = "";
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(rawBuffer).metadata();
    if (meta.width && meta.height) {
      const box = {
        left: Math.round(meta.width * 0.07),
        top: Math.round(meta.height * 0.295),
        width: Math.round(meta.width * 0.06),
        height: Math.round(meta.height * 0.03),
      };
      const cell = await sharp(rawBuffer)
        .extract(box)
        .resize({ width: box.width * 6 })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      const tesseract = await import("tesseract.js");
      const worker = await tesseract.createWorker("kan", 1, { workerPath: tesseractWorkerPath() });
      await worker.setParameters({ tessedit_pageseg_mode: "7" as import("tesseract.js").PSM });
      const { data } = await worker.recognize(cell);
      await worker.terminate();
      soilCellText = data.text;
      console.log("[land-records/rtc] Soil cell OCR:", JSON.stringify(soilCellText));
    }
  } catch (err) {
    console.warn("[land-records/rtc] ✗ Soil cell OCR failed:", err instanceof Error ? err.stack : err);
  }

  // Step 4: OCR with Kannada + English (dynamic import to avoid Next.js Webpack issues)
  try {
    console.log("[land-records/rtc] Starting OCR with Kannada...");
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker("kan+eng", 1, {
      workerPath: tesseractWorkerPath(),
      logger: (m) => { if (m.status === "recognizing text") console.log(`[land-records/rtc] OCR progress: ${Math.round((m.progress ?? 0) * 100)}%`); },
    });
    // PSM 6 ("assume a single uniform block of text") reads this ruled-table form more
    // reliably than the default automatic-layout mode, which tends to scramble cell order.
    await worker.setParameters({ tessedit_pageseg_mode: "6" as import("tesseract.js").PSM });
    const { data: { text: pageText } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    const text = soilCellText ? `${pageText}\n${soilCellText}` : pageText;
    console.log("[land-records/rtc] ✓ OCR completed, text length:", text.length);
    console.log("[land-records/rtc] OCR text (first 500):", text.substring(0, 500));

    // Step 5: Parse OCR text for land-use data
    const useCase = parseOcrText(text);
    if (useCase) useCase.imageUrl = rtcImageUrl;
    console.log("[land-records/rtc] Parsed useCase:", JSON.stringify(useCase));
    return useCase ?? { landClassification: "Unknown", summary: "OCR completed but no land-use data found", imageUrl: rtcImageUrl };
  } catch (err) {
    console.warn("[land-records/rtc] ✗ OCR failed:", err instanceof Error ? err.stack : err);
    return { landClassification: "Unknown", summary: "OCR failed", imageUrl: rtcImageUrl };
  }
}

/** Parse Kannada + English OCR text to extract land-use fields from RTC Form 16. */
function parseOcrText(text: string): RtcUseCase | undefined {
  if (!text) return undefined;

  // Common OCR misreads of Kannada — normalize before matching
  const normalized = text.replace(/\s+/g, " ");

  // --- Soil type (Section 5: ಮಣ್ಣಿನ ಸಮೂಹ) ---
  let soilType: string | undefined;
  // OCR often misreads Kannada characters, so include common mangling patterns
  // "ಮಿಶ್ರ" ("mishra" = mixed) variants are checked before their plain counterparts - Bhoomi's
  // soil-sample section commonly records mixed categories (e.g. ಕೆಂಪು ಮಿಶ್ರ = "Red Mixed") and
  // the soil-cell OCR crop sometimes clips the form right after "ಮಿಶ್ರ", before the trailing
  // "ಮಣ್ಣು" the plain patterns below require - so these need to match without that suffix.
  const soilPatterns: [RegExp, string][] = [
    [/ಕೆ[ಂ೦]ಪು\s*ಮಿಶ್ರ|kempu\s*mishra|Red\s*Mixed/i, "Red Mixed Soil"],
    [/ಕಪ್ಪು\s*ಮಿಶ್ರ|kappu\s*mishra|Black\s*Mixed/i, "Black Mixed Soil"],
    [/ಮರಳು\s*ಮಿಶ್ರ|maralu\s*mishra|Sandy\s*Mixed/i, "Sandy Mixed Soil"],
    [/ಕೆಂಪು\s*ಮಣ್ಣು|ಕೆಂಪುಮಣ್ಣು|ಕೆ[ಂ೦]\s*ಪು\s*ಮಣ|ಕೆ೦ಪು\s*ಮ[ಣ್]*ಣ್ಣಿ|ಕೆಂಪುಮ[ಣ್]*ಣ್ಣಿ|kempu\s*mannu|Red\s*Soil/i, "Red Soil"],
    [/ಕಪ್ಪು\s*ಮಣ್ಣು|ಕಪ್ಪುಮಣ್ಣು|ಕಪ್ಪು\s*ಮಣ|ಕಪ್ಪುಮ[ಣ್]*ಣ್ಣಿ|kappu\s*mannu|Black\s*Soil/i, "Black Soil"],
    [/ಹಳದಿ\s*ಮಣ್ಣು|haladi\s*mannu|Yellow\s*Soil/i, "Yellow Soil"],
    [/ಮರಳು\s*ಮಣ್ಣು|maralu\s*mannu|Sandy\s*Soil/i, "Sandy Soil"],
    [/ಕಂದು\s*ಮಣ್ಣು|kandu\s*mannu|Brown\s*Soil/i, "Brown Soil"],
    [/ನೀರಿನ\s*ಮಣ್ಣು|neerina\s*mannu|Alluvial/i, "Alluvial Soil"],
    [/Red\s*Soil/i, "Red Soil"],
    [/Black\s*Soil/i, "Black Soil"],
    [/Laterite/i, "Laterite Soil"],
    [/Loam/i, "Loam"],
  ];
  for (const [pat, val] of soilPatterns) {
    if (pat.test(normalized)) { soilType = val; break; }
  }

  // --- Patta type (Section 6: ಪಟ್ಟಾ) ---
  let pattaType: string | undefined;
  if (/ಸರ್ಕಾರಿ|sarkari|Government|Govt/i.test(normalized)) pattaType = "Government";
  else if (/ಖಾಸಗಿ|khasaki|Private/i.test(normalized)) pattaType = "Private";
  else if (/ಸ್ವ[ಂ೦]ತ|swanta/i.test(normalized)) pattaType = "Private";

  // --- Cultivation details (Section 12: ಸಾಗುವಳಿ) ---
  const crops: string[] = [];
  // Include both clean Kannada and common OCR-mangled patterns
  const cropPatterns: [RegExp, string][] = [
    [/ಅಡಿಕೆ|adike|Arecanut/i, "Arecanut"],
    [/ಭತ್ತ|bhatta|Paddy/i, "Paddy"],
    [/ಹುರುಳಿ|ಹು[ರ\s]*ಳಿ|huruli|Horse\s*Gram/i, "Horse Gram"],
    [/ಉದ್ದು|uddu|Black\s*Gram/i, "Black Gram"],
    [/ಹೆಸರು|hesaru|Green\s*Gram/i, "Green Gram"],
    [/ಶೇಂಗಾ|shenga|Groundnut/i, "Groundnut"],
    [/ಕಬ್ಬು|kabbu|Sugarcane/i, "Sugarcane"],
    [/ಬಾಜರಾ|bjara|Ragi|ರಾಗಿ/i, "Ragi"],
    [/ಜೋಳ|jola|Jowar/i, "Jowar"],
    [/ಮೆಕ್ಕೆಜೋಳ|mekkejola|Maize/i, "Maize"],
    [/ಕಾಫಿ|kaafi|Coffee/i, "Coffee"],
    [/ತರಕಾರಿ|tarakari|Vegetables/i, "Vegetables"],
    [/ಮೆಣಸಿನಕಾಯಿ|menasinakayi|Chilli/i, "Chilli"],
    [/ಟೊಮೇಟೊ|tomato|Tomato/i, "Tomato"],
    [/ಈರುಳ್ಳಿ|eerulli|Onion/i, "Onion"],
    [/ತಾಂಬೂಲ|tambula|Betel\s*Leaf/i, "Betel Leaf"],
    [/ಹಾಫ್|haaf|Pepper/i, "Pepper"],
    [/ಕಡಲೆ|kadale|Chickpea/i, "Chickpea"],
    [/ತೊಗರಿ|togari|Bengal\s*Gram/i, "Bengal Gram"],
    [/ಅವರೆ|avare|Field\s*Bean/i, "Field Bean"],
    [/ಸಾವಾಂಕಾಳು|savanakalu|Cowpea/i, "Cowpea"],
    [/ಎಳ್ಳು|ellu|Sesame/i, "Sesame"],
    [/ಸೋಯಾಬೀನ್|soyabean|Soybean/i, "Soybean"],
    [/ಮಾವು|maavu|Mango/i, "Mango"],
    [/ಬೀನ್|been|Bean/i, "Beans"],  // OCR often reads crops as "bean" variants
  ];
  for (const [pat, val] of cropPatterns) {
    if (pat.test(normalized) && !crops.includes(val)) crops.push(val);
  }

  // --- Irrigation source ---
  let irrigationSource: string | undefined;
  const irrPatterns: [RegExp, string][] = [
    [/ಬಾವಿ\s*\/\s*ಕೊಳವೆಬಾವಿ|Well\s*\/\s*Tube\s*Well/i, "Well / Tube Well"],
    [/ಕೊಳವೆಬಾವಿ|kolavebaavi|Tube\s*Well/i, "Tube Well"],
    [/ಬಾವಿ|baavi|Well/i, "Well"],
    [/ಕಾಲುವೆ|kaaluve|Canal/i, "Canal"],
    [/ನದಿ|nadi|River/i, "River"],
    [/ಕೆರೆ|kere|Lake/i, "Lake"],
    [/ಮಳೆ|male|Rainfed/i, "Rainfed"],
    [/ಹನಿನೀರಾವರಿ|hanineeravari|Drip/i, "Drip Irrigation"],
    [/Well/i, "Well"],
    [/Tube\s*Well/i, "Tube Well"],
    [/Canal/i, "Canal"],
    [/Rainfed|Rain\s*fed/i, "Rainfed"],
  ];
  for (const [pat, val] of irrPatterns) {
    if (pat.test(normalized)) { irrigationSource = val; break; }
  }

  // --- Season (Section 12: ವರ್ಷ ಮತ್ತು ಕಾಲ, and crop-name suffix like "ಬೀನ್ಸ (ಪೂ ಮು)") ---
  let season: string | undefined;
  const seasonPatterns: [RegExp, string][] = [
    [/ಪೂ\s*ಮು|ಪೂರ್ವ\s*ಮುಂಗಾರು|poorva\s*mungaru/i, "Pre-Kharif (Pre-Monsoon)"],
    [/ಮುಂಗಾರು|mungaru|Kharif/i, "Kharif (Monsoon)"],
    [/ಹಿಂಗಾರು|hingaru|Rabi/i, "Rabi (Winter)"],
    [/ಬೇಸಿಗೆ|besige|Summer/i, "Summer"],
  ];
  for (const [pat, val] of seasonPatterns) {
    if (pat.test(normalized)) { season = val; break; }
  }

  // --- Land classification ---
  let landClassification: string;
  if (/ಕೃಷಿ|krushi|Agriculture|cultivation|Crops/i.test(normalized)) landClassification = "Agriculture";
  else if (/ಸರ್ಕಾರಿ|sarkari|Government|Govt/i.test(normalized)) landClassification = "Government";
  else if (/ವಸತಿ|vasati|Residential/i.test(normalized)) landClassification = "Residential";
  else if (/ವಾಣಿಜ್ಯ|vanijya|Commercial/i.test(normalized)) landClassification = "Commercial";
  else landClassification = "Agriculture";

  // Build summary
  const parts: string[] = [];
  parts.push(landClassification);
  if (pattaType) parts.push(pattaType);
  if (soilType) parts.push(soilType);
  if (crops.length > 0) parts.push(`Crop: ${crops.join(", ")}`);
  if (irrigationSource) parts.push(`Water: ${irrigationSource}`);
  if (season) parts.push(season);

  if (parts.length <= 1 && !soilType && crops.length === 0 && !irrigationSource) return undefined;

  return { landClassification, soilType, crops: crops.length > 0 ? crops : undefined, irrigationSource, pattaType, season, summary: parts.join(" · ") };
}

async function fetchPreparedHissa(
  session: BhoomiSession,
  form: Record<string, string>,
  hissa: { value: string; text: string },
  ownersOnly: boolean,
) {
  form[`${PREFIX}ddlCHissaNo`] = hissa.value;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}ddlCHissaNo` }, `Hissa ${hissa.text}`);
  const period = session.options("ddlCPeriod")[0];
  if (!period) throw new Error("No RTC period available");
  form[`${PREFIX}ddlCPeriod`] = period.value;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}ddlCPeriod` }, "period");
  const year = session.options("ddlCYear")[0];
  if (year) form[`${PREFIX}ddlCYear`] = year.value;
  await session.post({ ...form, [`${PREFIX}btnCFetchDetails`]: "Fetch details" }, "fetch details");
  console.log("[land-records/rtc] Fetch details completed, html length:", session.html.length);
  const owners = parseOwners(session.html).map((o) => ({ ...o, hissa: hissa.text }));
  console.log("[land-records/rtc] owners parsed:", owners.length);
  // Skip the RTC Preview → image download → OCR chain when only owner names are needed
  // (e.g. adjacent-plot lookups) — that chain is the slow part (10s+ per parcel) and is
  // pointless work when the caller only wants "who owns this" for a handful of neighbors.
  const useCase = ownersOnly ? undefined : await fetchRtcPreview(session, form);
  return { owners, useCase };
}

async function fetchOwners(p: ParcelParams, ownersOnly: boolean) {
  const initial = await prepareSurvey(p);
  const allSurnocs = p.surnoc.trim() === "*" || p.surnoc.trim().toUpperCase() === "XX";
  const selectedSurnocs = allSurnocs
    ? initial.session.options("ddlCSurnocNo")
    : initial.session.options("ddlCSurnocNo").filter((o) => matchOption([o], p.surnoc) === o.value);
  if (selectedSurnocs.length === 0) throw new Error(`Surnoc "${p.surnoc}" not found`);

  const allHissas = p.hissa.trim() === "*" || p.hissa.trim().toUpperCase() === "XX";
  const owners: RtcOwner[] = [];
  let useCase: RtcUseCase | undefined;

  for (const surnoc of selectedSurnocs) {
    const probe = await prepareSurnoc(p, surnoc);
    const hList = allHissas ? probe.session.options("ddlCHissaNo")
      : probe.session.options("ddlCHissaNo").filter((o) => matchOption([o], p.hissa) === o.value);
    if (hList.length === 0) continue;
    for (const hissa of hList) {
      const prep = await prepareSurnoc(p, surnoc);
      const cur = prep.session.options("ddlCHissaNo").find((o) => o.value === hissa.value) ?? hissa;
      const r = await fetchPreparedHissa(prep.session, prep.form, cur, ownersOnly);
      owners.push(...r.owners);
      if (r.useCase && !useCase) useCase = r.useCase;
      // If we already got useCase from a previous hissa, skip further preview fetches
      if (useCase) break;
    }
  }
  if (owners.length === 0) throw new Error(`No owner records for survey "${p.survey}"`);
  return { owners, useCase };
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const params = {
    district: q.get("district") ?? "", taluk: q.get("taluk") ?? "",
    hobli: q.get("hobli") ?? "", village: q.get("village") ?? "",
    survey: q.get("survey") ?? "", surnoc: q.get("surnoc") ?? "*",
    hissa: q.get("hissa") ?? "*",
  };
  const ownersOnly = q.get("ownersOnly") === "1";
  const missing = (["district", "taluk", "hobli", "village", "survey"] as const).filter((k) => !params[k].trim());
  if (missing.length > 0) return NextResponse.json({ error: `Missing: ${missing.join(", ")}` }, { status: 400 });

  const key = `${Object.values(params).join("|").toLowerCase()}|ownersOnly=${ownersOnly}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ owners: hit.owners, useCase: hit.useCase, cached: true });
  }

  try {
    const { owners, useCase } = await fetchOwners(params, ownersOnly);
    cache.set(key, { at: Date.now(), owners, useCase });
    return NextResponse.json({ owners, useCase });
  } catch (error) {
    console.error("[land-records/rtc] lookup failed:", error);
    return NextResponse.json({ error: "Failed to fetch land records", message: error instanceof Error ? error.message : "Unknown" }, { status: 502 });
  }
}
