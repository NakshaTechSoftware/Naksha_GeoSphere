// Pure parsing/matching helpers for the Bhoomi RTC lookup in ./rtc/route.ts, kept out of the
// route file so they can be unit-tested (and because a route module may only export HTTP
// handlers).
import { similarity } from '../datasets/_folder-match';

export interface RtcOwner {
  name: string;
  extent: string;
  category: string;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// The <option>s of one Bhoomi dropdown, minus its "Select …" placeholder.
export function dropdownOptions(
  html: string,
  id: string
): { value: string; text: string }[] {
  const select = html.match(new RegExp(`id="ctl00_MainContent_${id}"[\\s\\S]*?</select>`));
  if (!select) return [];
  return [...select[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)</g)]
    .map((m) => ({ value: m[1]!, text: decodeEntities(m[2]!.trim()) }))
    .filter((o) => !/^Select /i.test(o.text));
}

// Bhoomi's spellings differ from the KGIS ones we carry on the map ("Hiregarje" there is
// "HIRIGARJE" here), so options are matched by closeness rather than equality. Unlike
// namesMatch (used for folder lookups) substring containment does NOT count here: village
// lists are long and full of short names, so "Bengaluru" would happily swallow "Aluru" and
// silently return another village's owners.
const normalize = (s: string) => s.toLowerCase().replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();

export function matchOption(
  options: { value: string; text: string }[],
  name: string
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
    [...html.matchAll(new RegExp(`_${suffix}">([^<]*)<`, 'g'))].map((m) =>
      decodeEntities(m[1]!.trim())
    );
  const names = grab('lblowner');
  const extents = grab('lblext');
  const categories = grab('lblkhatha');
  return names
    .map((name, i) => ({ name, extent: extents[i] ?? '', category: categories[i] ?? '' }))
    .filter((o) => o.name.length > 0);
}
