// Shared fuzzy matching used to resolve a district/taluk display name (as it appears in
// our GeoJSON properties, e.g. "Kalaburagi") to its MinIO folder name (e.g.
// "04_Kalaburgi") when the two don't share an exact substring relationship - KGIS data and
// the older district boundary layer sometimes use slightly different transliterations of
// the same name.

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1]
        ? prevDiag
        : 1 + Math.min(prevDiag, dp[j]!, dp[j - 1]!);
      prevDiag = temp;
    }
  }
  return dp[n]!;
}

// Strips a leading numeric code + separator (e.g. "17_Chikkamagaluru" -> "chikkamagaluru")
// and normalizes separators/case so folder names can be compared against display names.
export function cleanFolderName(name: string): string {
  return name
    .replace(/^\d+[-_]/, '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[()]/g, '')
    .trim();
}

// Display names in the current district boundary dataset that intentionally map to a
// differently named legacy MinIO hierarchy. Keep these aliases in the shared matcher so
// every drill-down API (taluks, hoblis, villages and cadastrals) resolves the same parent.
const PLACE_ALIASES: Record<string, string> = {
  'bengaluru south': 'ramanagara',
};

function canonicalName(name: string): string {
  const normalized = cleanFolderName(name).replace(/\s+/g, ' ');
  return PLACE_ALIASES[normalized] ?? normalized;
}

// 0..1 closeness of two already-normalized names, for callers that need to rank candidates
// rather than take a yes/no verdict (see namesMatch).
export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(a, b) / maxLen;
}

// True if `folderName` (already run through cleanFolderName) and `displayName` (a raw
// district/taluk name) plausibly refer to the same place: exact match, one contains the
// other, or - as a last resort - they're within a small edit-distance tolerance to absorb
// minor transliteration differences like "Kalaburagi" vs "Kalaburgi".
export function namesMatch(cleanFolder: string, displayName: string): boolean {
  // Parentheses are stripped from BOTH sides so "Bengaluru (Rural)" matches the
  // "Bengaluru_Rural" folder (cleanFolderName already removes parens from folders).
  const canonicalFolder = canonicalName(cleanFolder);
  const cleanDisplay = canonicalName(displayName);
  if (!canonicalFolder || !cleanDisplay) return false;

  if (
    canonicalFolder === cleanDisplay ||
    canonicalFolder.includes(cleanDisplay) ||
    cleanDisplay.includes(canonicalFolder)
  ) {
    return true;
  }

  return similarity(canonicalFolder, cleanDisplay) >= 0.9;
}
