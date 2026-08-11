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
export function namesMatch(folderOrName: string, displayName: string): boolean {
  // Most legacy callers pass an already-cleaned folder name, while the consolidated
  // statewide APIs pass ordinary display names. Normalize both sides here so casing,
  // parentheses and separators can never prevent a valid hierarchy match.
  const cleanFolder = cleanFolderName(folderOrName);
  const cleanDisplay = cleanFolderName(displayName);
  if (!cleanFolder || !cleanDisplay) return false;

  if (
    cleanFolder === cleanDisplay ||
    cleanFolder.includes(cleanDisplay) ||
    cleanDisplay.includes(cleanFolder)
  ) {
    return true;
  }

  return similarity(cleanFolder, cleanDisplay) >= 0.9;
}
