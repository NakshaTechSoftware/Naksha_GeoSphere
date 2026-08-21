// Pure parsing/matching helpers for the Bhoomi RTC lookup in ./rtc/route.ts, kept out of the
// route file so they can be unit-tested (and because a route module may only export HTTP
// handlers).
import { similarity } from "../datasets/_folder-match";

export interface RtcOwner {
  name: string;
  extent: string;
  category: string;
  hissa?: string;
}

// Cultivation / land-use details extracted from the PreviewRTC page (RTC Form 16).
export interface RtcUseCase {
  /** e.g. "Agriculture", "Non-Agriculture", "Government" */
  landClassification: string;
  /** e.g. "Red Soil", "Black Soil" */
  soilType?: string;
  /** e.g. ["Arecanut"], ["Paddy", "Sugarcane"] */
  crops?: string[];
  /** e.g. "Well / Tube Well", "Rainfed", "Canal" */
  irrigationSource?: string;
  /** Patta type — "Private" or "Government" */
  pattaType?: string;
  /** Season — e.g. "Kharif", "Rabi" */
  season?: string;
  /** URL to the RTC preview PNG image */
  imageUrl?: string;
  /** Full summary string for display in the Land Use row */
  summary: string;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// The <option>s of one Bhoomi dropdown, minus its "Select …" placeholder.
export function dropdownOptions(html: string, id: string): { value: string; text: string }[] {
  const select = html.match(new RegExp(`id="ctl00_MainContent_${id}"[\\s\\S]*?</select>`));
  if (!select) return [];
  return [...select[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)]
    .map((m) => ({ value: m[1]!, text: decodeEntities(m[2]!.trim()) }))
    .filter((o) => !/^Select /i.test(o.text));
}

const normalize = (s: string) => s.toLowerCase().replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();

export function matchOption(
  options: { value: string; text: string }[],
  name: string,
): string | undefined {
  const target = normalize(name);
  let best: { value: string; score: number } | undefined;
  for (const o of options) {
    const score = similarity(normalize(o.text), target);
    if (!best || score > best.score) best = { value: o.value, score };
  }
  return best && best.score >= 0.8 ? best.value : undefined;
}

// The RTC result grid renders one <span id="…_lblowner">/_lblext/_lblkhatha per owner row.
export function parseOwners(html: string): RtcOwner[] {
  const grab = (suffix: string) =>
    [...html.matchAll(new RegExp(`_${suffix}">([^<]*)<`, "g"))].map((m) =>
      decodeEntities(m[1]!.trim()),
    );
  const names = grab("lblowner");
  const extents = grab("lblext");
  const categories = grab("lblkhatha");
  return names
    .map((name, i) => ({ name, extent: extents[i] ?? "", category: categories[i] ?? "" }))
    .filter((o) => o.name.length > 0);
}

// ---------------------------------------------------------------------------
// ASP.NET AJAX Delta format parser
// ---------------------------------------------------------------------------
// Bhoomi uses ASP.NET AJAX UpdatePanel. When the request includes
//   X-MicrosoftAjax: Delta=true
// the server returns a pipe-delimited delta response instead of full HTML:
//
//   updatePanel|panelId|<html content>
//   hiddenField|__VIEWSTATE|value
//   hiddenField|__EVENTVALIDATION|value
//   …
//
// This is dramatically smaller and faster to parse than full page HTML.

export interface DeltaResult {
  /** Reconstructed HTML from all updatePanel entries (concatenated). */
  html: string;
  /** Updated hidden field values keyed by name. */
  hiddenFields: Record<string, string>;
}

export function parseDeltaResponse(raw: string): DeltaResult {
  const htmlParts: string[] = [];
  const hiddenFields: Record<string, string> = {};

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const firstSep = line.indexOf("|");
    const secondSep = line.indexOf("|", firstSep + 1);
    if (secondSep === -1) continue;

    const type = line.substring(0, firstSep);
    const id = line.substring(firstSep + 1, secondSep);
    const content = line.substring(secondSep + 1);

    if (type === "updatePanel") {
      htmlParts.push(content);
    } else if (type === "hiddenField") {
      hiddenFields[id] = content;
    }
    // pageRedirect, asyncPostBackControlIDs, etc. are ignored
  }

  return { html: htmlParts.join("\n"), hiddenFields };
}

// ---------------------------------------------------------------------------
// Kannada → English translation for RTC Preview page (Form 16)
// ---------------------------------------------------------------------------

const KANNADA_MAP: Record<string, string> = {
  // Soil types
  "ಕೆಂಪುಮಣ್ಣು": "Red Soil",
  "ಕಪ್ಪುಮಣ್ಣು": "Black Soil",
  "ಹಳದಿಮಣ್ಣು": "Yellow Soil",
  "ಮರಳುಮಣ್ಣು": "Sandy Soil",
  "ಕಂದುಮಣ್ಣು": "Brown Soil",
  "ನೀರಿನಮಣ್ಣು": "Alluvial Soil",
  "ಮಣ್ಣು": "Soil",

  // Crops
  "ಅಡಿಕೆ": "Arecanut",
  "ಭತ್ತ": "Paddy",
  "ಹುರುಳಿ": "Horse Gram",
  "ಉದ್ದು": "Black Gram",
  "ಹೆಸರು": "Green Gram",
  "ಶೇಂಗಾ": "Groundnut",
  "ಕಬ್ಬು": "Sugarcane",
  "ತರಕಾರಿ": "Vegetables",
  "ಮೆಣಸಿನಕಾಯಿ": "Chilli",
  "ಟೊಮೇಟೊ": "Tomato",
  "ಈರುಳ್ಳಿ": "Onion",
  "ಬೆಳ್ಳುಲ್ಲಿ": "Garlic",
  "ಬಾಜರಾ": "Ragi",
  "ಜೋಳ": "Jowar",
  "ಬಾಜ್ರಾ": "Bajra",
  "ಮೆಕ್ಕೆಜೋಳ": "Maize",
  "ಎಳ್ಳು": "Sesame",
  "ಸೋಯಾಬೀನ್": "Soybean",
  "ಅಲಸಂದೆ": "Lentil",
  "ತಾಂಬೂಲ": "Betel Leaf",
  "ಕಾಫಿ": "Coffee",
  "ಟೀ": "Tea",
  "ಹಾಫ್": "Pepper",
  "ಅವರೆ": "Field Bean",
  "ತೊಗರಿ": "Bengal Gram",
  "ಸಾವಾಂಕಾಳು": "Cowpea",
  "ಸಬ್ಬಕ್ಕಿ": "Little Millet",
  "ರಾಗಿ": "Ragi",
  "ನವಣೆ": "Foxtail Millet",
  "ಕಡಲೆ": "Chickpea",
  "ವಾಂಗು": "Brinjal",
  "ಬದನೆಕಾಯಿ": "Brinjal",
  "ಸೌತೆಕಾಯಿ": "Cucumber",
  "ಮಾವು": "Mango",

  // Water / irrigation sources
  "ಬಾವಿ/ಕೊಳವೆಬಾವಿ": "Well / Tube Well",
  "ಕೆರೆ": "Lake",
  "ಬಾವಿ": "Well",
  "ಕೊಳವೆಬಾವಿ": "Tube Well",
  "ನದಿ": "River",
  "ಮಳೆ": "Rainfed",
  "ಹೊಳೆ": "River",
  "ಕಾಲುವೆ": "Canal",
  "ಹನಿನೀರಾವರಿ": "Drip Irrigation",
  "ಸ್ಪ್ರಿಂಕ್ಲರ್": "Sprinkler",

  // Land classification
  "ಸರ್ಕಾರಿ": "Government",
  "ಸ್ವಂತ": "Private",
  "ಖಾಸಗಿ": "Private",
  "ಕೃಷಿ": "Agriculture",
  "ಕೃಷಿಭೂಮಿ": "Agricultural Land",
  "ವಸತಿ": "Residential",
  "ವಾಣಿಜ್ಯ": "Commercial",

  // Seasons
  "ಮುಂಗಾರು": "Kharif (Monsoon)",
  "ಹಿಂಗಾರು": "Rabi (Winter)",
  "ಬೇಸಿಗೆ": "Summer",
};

function translateKannada(text: string): string {
  if (!text) return text;
  const latinRatio = (text.match(/[a-zA-Z]/g) ?? []).length / Math.max(text.length, 1);
  if (latinRatio > 0.5) return text;

  let result = text;
  const sortedKeys = Object.keys(KANNADA_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (result.includes(key)) {
      result = result.replaceAll(key, KANNADA_MAP[key]!);
    }
  }
  return result.trim() || text;
}

// ---------------------------------------------------------------------------
// Parse the PreviewRTC.aspx page (RTC Form 16)
// ---------------------------------------------------------------------------

export function parseRtcPreview(html: string): RtcUseCase | undefined {
  if (!html) return undefined;

  const decoded = decodeEntities(html);

  // --- Soil type ---
  let soilType: string | undefined;
  const soilPatterns = [
    /ಕೆಂಪುಮಣ್ಣು/, /ಕಪ್ಪುಮಣ್ಣು/, /ಹಳದಿಮಣ್ಣು/, /ಮರಳುಮಣ್ಣು/, /ಕಂದುಮಣ್ಣು/, /ನೀರಿನಮಣ್ಣು/,
  ];
  for (const pat of soilPatterns) {
    const m = decoded.match(pat);
    if (m) { soilType = translateKannada(m[0]); break; }
  }

  // --- Patta type ---
  let pattaType: string | undefined;
  if (/\bಸರ್ಕಾರಿ\b/.test(decoded)) pattaType = "Government";
  else if (/ಸ್ವಂತ|ಖಾಸಗಿ/.test(decoded)) pattaType = "Private";

  // --- Cultivation details (Section 12) ---
  const crops: string[] = [];
  const KNOWN_CROPS = [
    "ಅಡಿಕೆ", "ಭತ್ತ", "ಹುರುಳಿ", "ಉದ್ದು", "ಹೆಸರು", "ಶೇಂಗಾ", "ಕಬ್ಬು",
    "ತರಕಾರಿ", "ಮೆಣಸಿನಕಾಯಿ", "ಟೊಮೇಟೊ", "ಈರುಳ್ಳಿ", "ಬೆಳ್ಳುಲ್ಲಿ", "ಬಾಜರಾ",
    "ಜೋಳ", "ಮೆಕ್ಕೆಜೋಳ", "ಎಳ್ಳು", "ಸೋಯಾಬೀನ್", "ಅಲಸಂದೆ", "ತಾಂಬೂಲ",
    "ಕಾಫಿ", "ಟೀ", "ಹಾಫ್", "ಅವರೆ", "ತೊಗರಿ", "ಸಬ್ಬಕ್ಕಿ", "ರಾಗಿ",
    "ನವಣೆ", "ಕಡಲೆ", "ವಾಂಗು", "ಮಾವು",
  ];

  const tdMatches = [...decoded.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
  const thMatches = [...decoded.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  const allCells = [...tdMatches, ...thMatches].map((m) =>
    decodeEntities(m[1]!.replace(/<[^>]*>/g, "").trim()),
  );

  for (const cell of allCells) {
    for (const crop of KNOWN_CROPS) {
      if (cell.includes(crop) && !crops.includes(crop)) {
        crops.push(crop);
      }
    }
  }

  // --- Irrigation source ---
  let irrigationSource: string | undefined;
  const irrigationPatterns = [
    /ಬಾವಿ\/ಕೊಳವೆಬಾವಿ/, /ಕೊಳವೆಬಾವಿ/, /ಬಾವಿ/, /ಕಾಲುವೆ/, /ನದಿ/, /ಕೆರೆ/, /ಮಳೆ/, /ಹನಿನೀರಾವರಿ/,
  ];
  for (const cell of allCells) {
    for (const pat of irrigationPatterns) {
      if (pat.test(cell)) {
        irrigationSource = translateKannada(cell.match(pat)![0]);
        break;
      }
    }
    if (irrigationSource) break;
  }

  // --- Season ---
  let season: string | undefined;
  if (/ಮುಂಗಾರು/.test(decoded)) season = "Kharif (Monsoon)";
  else if (/ಹಿಂಗಾರು/.test(decoded)) season = "Rabi (Winter)";

  // --- Land classification ---
  let landClassification: string;
  if (/ಕೃಷಿ|ವ್ಯವಸಾಯ/.test(decoded)) landClassification = "Agriculture";
  else if (/ಸರ್ಕಾರಿ/.test(decoded)) landClassification = "Government";
  else if (/ವಸತಿ/.test(decoded)) landClassification = "Residential";
  else if (/ವಾಣಿಜ್ಯ/.test(decoded)) landClassification = "Commercial";
  else landClassification = "Agriculture";

  // Build summary
  const parts: string[] = [];
  parts.push(landClassification);
  if (pattaType) parts.push(pattaType);
  if (soilType) parts.push(soilType);
  if (crops.length > 0) {
    const translatedCrops = crops.map((c) => translateKannada(c));
    parts.push(`Crop: ${translatedCrops.join(", ")}`);
  }
  if (irrigationSource) parts.push(`Water: ${irrigationSource}`);
  if (season) parts.push(season);

  if (parts.length <= 1 && !soilType && crops.length === 0 && !irrigationSource) {
    return undefined;
  }

  return {
    landClassification,
    soilType,
    crops: crops.length > 0 ? crops.map((c) => translateKannada(c)) : undefined,
    irrigationSource,
    pattaType,
    season,
    summary: parts.join(" · "),
  };
}
