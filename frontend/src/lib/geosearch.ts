/**
 * Geospatial search engine for the explore page.
 *
 * Implements the core of the NAKSHA GEOSEARCH pipeline (query understanding ->
 * candidate retrieval -> ranking) that the project can support with the
 * authoritative boundary data it already loads:
 *
 *   Raw query -> normalization -> alias/abbreviation expansion
 *             -> intent classification -> tiered candidate scoring -> ranking
 *
 * Tiers are applied strictly (never fuzzy-match everything, per the spec):
 *   exact -> normalized exact -> alias -> prefix -> token-prefix -> substring
 *         -> bounded fuzzy -> no match
 *
 * This is intentionally backend-portable: the same normalization + tier
 * scoring maps directly onto a Postgres/PostGIS (pg_trgm) or OpenSearch
 * implementation later. For now it runs in the browser over the same in-memory
 * boundary indexes the map already uses.
 */

/** Folds diacritics, lowercases, collapses punctuation/whitespace. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .toLowerCase()
    .replace(/[^a-z0-9\u0c80-\u0cff]+/g, " ") // keep latin + Kannada, else space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Common-spelling / abbreviation / regional / Kannada aliases -> canonical.
 * The user-facing form stays whatever the data says; these only widen what
 * matches it (e.g. "bangalore" and "ಬೆಂಗಳೂರು" both surface "Bengaluru").
 */
const ALIAS_MAP: Record<string, string> = {
  // Bengaluru (incl. common partial spellings so "bangal..." autocompletes)
  bangalore: "bengaluru",
  bangalor: "bengaluru",
  bangalo: "bengaluru",
  bangal: "bengaluru",
  bengalooru: "bengaluru",
  blr: "bengaluru",
  "b'lore": "bengaluru",
  ಬೆಂಗಳೂರು: "bengaluru",
  // Mangaluru
  mangalore: "mangaluru",
  manglore: "mangaluru",
  // Mysuru
  mysore: "mysuru",
  // Hubballi
  hubli: "hubballi",
  // Ballari
  bellary: "ballari",
  // Shivamogga
  shimoga: "shivamogga",
  // Kalaburagi
  gulbarga: "kalaburagi",
  kalburgi: "kalaburagi",
  // Tumakuru
  tumkur: "tumakuru",
  // Chikkamagaluru
  chikmagalur: "chikkamagaluru",
  chikmagaluru: "chikkamagaluru",
  // Chitradurga
  chitaldrug: "chitradurga",
  // Belagavi
  belgaum: "belagavi",
  // Vijayapura
  bijapur: "vijayapura",
  // Kodagu
  coorg: "kodagu",
};

/**
 * High-confidence common misspellings learned from real-world query behavior
 * (typo spec's "historical/common-misspelling dictionary"). These are only
 * applied when the literal token matches nothing - the alias dictionary above
 * handles legitimate alternate names; this handles genuine typos.
 */
const TYPO_MAP: Record<string, string> = {
  banglore: "bengaluru",
  bangloor: "bengaluru",
  banglaore: "bengaluru",
  banglur: "bengaluru",
  bangaluru: "bengaluru",
  bengalur: "bengaluru",
  indranagr: "indiranagar",
  indranagar: "indiranagar",
  indernagar: "indiranagar",
  yelankha: "yelahanka",
  yelanka: "yelahanka",
  yelhanka: "yelahanka",
  yelahankha: "yelahanka",
  majestc: "majestic",
  majestik: "majestic",
  koramangla: "koramangala",
  koramangal: "koramangala",
  whitefild: "whitefield",
  whitefeild: "whitefield",
  jayanagr: "jayanagar",
};

/** Alias + typo dictionaries combined; typos are lower-priority. */
const CANON_MAP: Record<string, string> = { ...TYPO_MAP, ...ALIAS_MAP };

/**
 * Classifies a raw query into an intent. This data set supports admin places,
 * chains ("Karnataka, Hassan, ...") and plain names; postal/coordinate intents
 * are detected up front so they don't waste candidate work (they need an
 * address/PIN layer that doesn't exist in the boundary data yet).
 */
export type SearchIntent =
  | "PLACE"
  | "ADMIN_CHAIN"
  | "POSTAL_CODE"
  | "COORDINATES";

export interface QueryInfo {
  intent: SearchIntent;
  raw: string;
  normalized: string;
  /** Original + alias-expanded tokens (aliases appended, not replacing). */
  tokens: string[];
}

export function classifyQuery(raw: string): QueryInfo {
  const trimmed = raw.trim();
  const normalized = normalize(trimmed);

  // 12.9716,77.5946  /  12.9716 77.5946  -> COORDINATES
  if (/^-?\d{1,2}(\.\d+)?\s*[,/\s]\s*-?\d{1,3}(\.\d+)?$/.test(trimmed)) {
    return { intent: "COORDINATES", raw: trimmed, normalized, tokens: [] };
  }

  // 560001 (6-digit PIN) -> POSTAL_CODE
  if (/^\d{6}$/.test(trimmed)) {
    return { intent: "POSTAL_CODE", raw: trimmed, normalized, tokens: [] };
  }

  // "Karnataka, Hassan, ..." -> ADMIN_CHAIN
  if (trimmed.includes(",")) {
    return { intent: "ADMIN_CHAIN", raw: trimmed, normalized, tokens: [] };
  }

  // PLACE: canonicalize every token (abbreviations/alternate spellings/Kannada
  // -> the name used in the data), so "blr" scores as "bengaluru", "mysore" as
  // "mysuru", and "ಬೆಂಗಳೂರು" as "bengaluru". The normalized string is the
  // canonical form too, so exact/prefix/substring tiers all see it.
  const rawTokens = normalized.split(" ").filter(Boolean);
  const tokens = rawTokens.map((token) => CANON_MAP[token] ?? token);
  const canonical = tokens.join(" ");
  return { intent: "PLACE", raw: trimmed, normalized: canonical, tokens };
}

/**
 * Adjacent-key substitution pairs for the keyboard-error model: swapping one
 * of these (g<->h, n<->m, i<->o, ...) costs less than a random substitution.
 */
const KEYBOARD_NEIGHBORS: Record<string, string> = {
  g: "h", h: "g", i: "o", o: "i", n: "m", m: "n", a: "s", s: "a",
  e: "r", r: "e", u: "y", y: "u", f: "g", j: "k", k: "l", v: "b",
  b: "n", c: "v", d: "f", t: "y", p: "o", l: "k", w: "e", q: "w",
  x: "s", z: "a",
};

/** Substitution cost: cheaper for adjacent keys (keyboard-error model). */
function substitutionCost(x: string, y: string): number {
  if (x === y) return 0;
  return KEYBOARD_NEIGHBORS[x ?? ""] === y ? 0.75 : 1;
}

/**
 * Bounded Damerau-Levenshtein (optimal string alignment) with keyboard-weighted
 * substitution costs. Handles insertions, deletions, substitutions and adjacent
 * transpositions ("banglaore" -> "bangalore", "hopsital" -> "hospital").
 * Returns max+1 when the distance exceeds `max`.
 */
function weightedDamerau(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const row0 = Array.from({ length: b.length + 1 }, (_, i) => i);
  let prev2 = row0;
  let prev1 = row0;
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const sub = (prev1[j - 1] ?? 0) + substitutionCost(a[i - 1] ?? "", b[j - 1] ?? "");
      const del = (prev1[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      let best = Math.min(sub, del, ins);
      // Adjacent transposition: ab -> ba costs 1.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (prev2[j - 2] ?? 0) + 1);
      }
      curr[j] = best;
    }
    prev2 = prev1;
    prev1 = curr;
  }
  return prev1[b.length] ?? max + 1;
}

/** Adaptive edit threshold: short words tolerate fewer edits (typo spec). */
function maxEditsFor(len: number): number {
  if (len <= 3) return 1;
  if (len <= 9) return 2;
  return 3;
}

/** Normalized similarity in [0,1]; -1 when beyond the adaptive threshold. */
function editSimilarity(a: string, b: string): number {
  if (!a || !b) return -1;
  const max = maxEditsFor(Math.min(a.length, b.length));
  const d = weightedDamerau(a, b, max);
  if (d > max) return -1;
  return 1 - d / Math.max(a.length, b.length);
}

/** Classic Soundex for Latin-script names (phonetic matching signal). */
function soundex(word: string): string {
  const codes: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1", c: "2", g: "2", j: "2", k: "2",
    q: "2", s: "2", x: "2", z: "2", d: "3", t: "3", l: "4", m: "5",
    n: "5", r: "6",
  };
  const first = word[0] ?? "";
  let out = first.toUpperCase();
  let prevCode = codes[first] ?? "";
  for (let i = 1; i < word.length && out.length < 4; i++) {
    const code = codes[word[i] ?? ""] ?? "";
    if (code && code !== prevCode) out += code;
    if (code) prevCode = code;
    else prevCode = "";
  }
  return out.padEnd(4, "0");
}

/** Common suffix tokens for compound split/merge ("whitefield" -> "white field"). */
const COMPOUND_SUFFIXES = [
  "road", "rd", "field", "city", "nagar", "layout", "gate", "garden", "park",
  "circle", "market", "cross", "junction", "square", "town", "village", "fort",
  "palace", "lake", "street", "st", "bypass", "colony", "extension", "extn",
];

/** Is `token` a prefix of any whitespace-delimited word in `text`? */
function tokenPrefixMatch(token: string, text: string): boolean {
  if (!token) return false;
  return text.split(" ").some((word) => word.startsWith(token));
}

/** Do ALL query tokens prefix a word of `text`? */
function allTokensPrefix(tokens: string[], text: string): boolean {
  if (tokens.length === 0 || !text) return false;
  const words = text.split(" ");
  return (
    words.length >= tokens.length &&
    tokens.every((t) => words.some((w) => w.startsWith(t)))
  );
}

export interface ScoredMatch {
  score: number;
  matched: boolean;
  fuzzy: boolean;
}

// Memoized normalized forms per entry object - the village index is tens of
// thousands of entries scanned on every keystroke, so we normalize each entry
// once instead of re-doing the (relatively heavy) Unicode fold per query.
const normCache = new WeakMap<
  object,
  { leaf: string; label: string }
>();

function cachedNorm(entry: { label: string; leaf: string }): { leaf: string; label: string } {
  const cached = normCache.get(entry);
  if (cached) return cached;
  const value = { leaf: normalize(entry.leaf), label: normalize(entry.label) };
  normCache.set(entry, value);
  return value;
}

/**
 * Scores one place against a classified query, in strict tiers:
 * exact leaf > exact label > leaf prefix > label prefix > all-token prefix
 * > substring > bounded fuzzy. Returns null when nothing matches.
 */
export function scorePlace(
  leaf: string,
  label: string,
  query: QueryInfo,
  prenormalized?: { leaf: string; label: string },
): ScoredMatch | null {
  const { leaf: leafNorm, label: labelNorm } = prenormalized ?? {
    leaf: normalize(leaf),
    label: normalize(label),
  };
  if (!leafNorm && !labelNorm) return null;

  const q = query.normalized;

  // Exact tiers (no aliases needed - the query string already includes them).
  if (q && leafNorm === q) return { score: 1.0, matched: true, fuzzy: false };
  if (q && labelNorm === q) return { score: 0.96, matched: true, fuzzy: false };
  if (q && leafNorm.startsWith(q)) return { score: 0.9, matched: true, fuzzy: false };
  if (q && labelNorm.startsWith(q)) return { score: 0.8, matched: true, fuzzy: false };

  const leafWords = leafNorm.length ? leafNorm.split(" ") : [];
  const labelWords = labelNorm.length ? labelNorm.split(" ") : [];

  // Token-prefix tier: every query token (with aliases) prefixes a word of the
  // leaf or label. e.g. "mg road" -> "Mahatma Gandhi Road", "blr urban" ->
  // "Bengaluru (Urban)".
  if (query.tokens.length > 1) {
    if (allTokensPrefix(query.tokens, leafNorm)) return { score: 0.85, matched: true, fuzzy: false };
    if (allTokensPrefix(query.tokens, labelNorm)) return { score: 0.72, matched: true, fuzzy: false };
  }

  // Token-fuzzy tier (multi-word queries): if every token except one prefixes a
  // word, the leftover token may be a typo - e.g. "white filed" -> Whitefield,
  // "apollo hospitl" -> Apollo Hospital. Only one typo is tolerated.
  if (query.tokens.length > 1 && query.tokens.length <= 4) {
    const misspelled = query.tokens.filter(
      (t) => !leafWords.some((w) => w.startsWith(t)) && !labelWords.some((w) => w.startsWith(t)),
    );
    if (misspelled.length === 1) {
      const bad = misspelled[0] ?? "";
      const fixLeaf =
        bad.length >= 4 &&
        leafWords.some((w) => editSimilarity(w, bad) > 0.5);
      const fixLabel =
        bad.length >= 4 &&
        labelWords.some((w) => editSimilarity(w, bad) > 0.5);
      if (fixLeaf) return { score: 0.66, matched: true, fuzzy: true };
      if (fixLabel) return { score: 0.58, matched: true, fuzzy: true };
    }
  }

  // Compound split/merge tier: "whitefield" -> "white field", "electroniccity"
  // -> "electronic city" (spec's word-splitting correction).
  if (q && !q.includes(" ") && q.length >= 6) {
    for (const suffix of COMPOUND_SUFFIXES) {
      if (q.length > suffix.length + 2 && q.endsWith(suffix)) {
        const head = q.slice(0, q.length - suffix.length);
        const inLeaf =
          leafWords.some((w) => w.startsWith(head)) &&
          leafWords.some((w) => w.startsWith(suffix));
        const inLabel =
          labelWords.some((w) => w.startsWith(head)) &&
          labelWords.some((w) => w.startsWith(suffix));
        if (inLeaf) return { score: 0.68, matched: true, fuzzy: true };
        if (inLabel) return { score: 0.6, matched: true, fuzzy: true };
      }
    }
  }

  // Substring tier.
  if (q && leafNorm.includes(q)) return { score: 0.62, matched: true, fuzzy: false };
  if (q && labelNorm.includes(q)) return { score: 0.5, matched: true, fuzzy: false };

  // Typo-correction tier - only for reasonably long, single-token queries, so
  // auto-correct never floods results with garbage. Uses adaptive thresholds
  // (short words tolerate fewer edits), keyboard-weighted Damerau-Levenshtein,
  // and a Soundex phonetic bonus ("shimoga" ~ "shivamogga").
  if (q && q.length >= 4 && !q.includes(" ")) {
    const leafSim = editSimilarity(leafNorm, q);
    if (leafSim > 0.5) {
      const phonetic =
        !leafNorm.includes("\u0c80") && !q.includes("\u0c80") && soundex(leafNorm) === soundex(q)
          ? 0.1
          : 0;
      return { score: Math.min(0.3 + leafSim * 0.45 + phonetic, 0.74), matched: true, fuzzy: true };
    }
    const labelSim = editSimilarity(labelNorm, q);
    if (labelSim > 0.5) {
      return { score: Math.min(0.24 + labelSim * 0.4, 0.6), matched: true, fuzzy: true };
    }
  }

  return null;
}

/** Context bias: entries inside the currently-selected district/taluk rank up. */
function contextBoost(label: string, boostLabel: string | undefined): number {
  if (!boostLabel) return 0;
  const l = normalize(boostLabel);
  return normalize(label).includes(l) ? 0.06 : 0;
}

/**
 * Ranks a list of {label, leaf} entries for a query and returns ranked label
 * strings (the shape the explore search dropdown consumes).
 *
 * `boostLabel` - the map's current drill context ("Karnataka, Chikkamagaluru")
 * so results in the visible area outrank distant same-name places.
 * `fuzzy` - allow typo-tolerant matches (leaf-level only, capped).
 * `limit` - max results returned.
 */
export function rankLocationEntries(
  entries: ReadonlyArray<{ label: string; leaf: string }>,
  rawQuery: string,
  opts: { boostLabel?: string; fuzzy?: boolean; limit?: number } = {},
): string[] {
  const limit = opts.limit ?? 6;
  const query = classifyQuery(rawQuery);
  if (!query.normalized || query.intent === "COORDINATES" || query.intent === "POSTAL_CODE") {
    return [];
  }

  const scored: { label: string; score: number }[] = [];
  let fuzzyUsed = 0;

  for (const entry of entries) {
    const match = scorePlace(entry.leaf, entry.label, query, cachedNorm(entry));
    if (!match) continue;
    if (match.fuzzy) {
      if (!opts.fuzzy || fuzzyUsed >= 3) continue;
      fuzzyUsed += 1;
    }
    const score = match.score + contextBoost(entry.label, opts.boostLabel);
    scored.push({ label: entry.label, score });
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((s) => s.label);
}

/** Ranks a flat list of static suggestion strings (Bengaluru regions/wards/...). */
export function rankStaticSuggestions(
  items: ReadonlyArray<string>,
  rawQuery: string,
  limit = 6,
): string[] {
  const query = classifyQuery(rawQuery);
  if (!query.normalized || query.intent !== "PLACE") return [];
  const scored: { label: string; score: number }[] = [];
  let fuzzyUsed = 0;
  for (const item of items) {
    const match = scorePlace(item, item, query);
    if (!match) continue;
    if (match.fuzzy) {
      if (fuzzyUsed >= 2) continue;
      fuzzyUsed += 1;
    }
    scored.push({ label: item, score: match.score });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((s) => s.label);
}
