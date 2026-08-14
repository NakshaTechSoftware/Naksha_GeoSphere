#!/usr/bin/env node
/**
 * Builds frontend/src/data/karnataka-parliament-elections.json — per-parliamentary-
 * constituency 2024 Karnataka election facts (State, Districts, Assembly Segments,
 * Current MP, Party, Election Year, Total Voters, Voter Turnout), used to enrich the
 * Parliamentary Constituency Boundaries attribute panel and as the offline fallback for
 * the state-parliament API route (which prefers the same sources fetched live).
 *
 * Sources:
 * - Winner/party/polled votes: https://data-analytics.github.io/Election_Data_2024/parliament.csv
 *   (all-India per-candidate rows compiled from eci.gov.in / results.eci.gov.in).
 * - Districts / assembly segments / electorate: https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv
 *   — each AC carries its p_constituency, District and Male/Female/Other electors, so a
 *   PC's assembly segments = its ACs, its districts = their distinct districts, and its
 *   total voters = the sum of those AC electors. Voter turnout = polled / total voters.
 *
 * Only the LATEST election year present in each file is used. Output is keyed by
 * zero-padded PC code (e.g. "015"), matching the PC_Code parsed from the KML description
 * of each parliamentary boundary feature.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PARLIAMENT_CSV_URL =
  "https://data-analytics.github.io/Election_Data_2024/parliament.csv";
const ASSEMBLY_CSV_URL =
  "https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv";

function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    for (const h of header) {
      const i = idx[h];
      if (i !== undefined) row[h] = (cells[i] ?? "").trim();
    }
    return row;
  });
}

// Known spelling variants between the two sources' PC names (assembly CSV used the older
// transliteration; the 2024 parliament CSV uses the official PC spelling). Applied to the
// AC's p_constituency before joining to the parliament winners by normalized name.
const PC_NAME_ALIASES = {
  davangere: "davanagere",
  chikballapur: "chikkballapur",
};
const normPcName = (name) => {
  const norm = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return PC_NAME_ALIASES[norm] ?? norm;
};

const [parlCsv, asmCsv] = await Promise.all([
  (await fetch(PARLIAMENT_CSV_URL)).text(),
  (await fetch(ASSEMBLY_CSV_URL)).text(),
]);
const parlRows = parseCsv(parlCsv);
const asmRows = parseCsv(asmCsv);

const latestYear = (rows, key) => {
  const years = [...new Set(rows.map((r) => r[key]).filter(Boolean))]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
  return years.length ? Math.max(...years) : 0;
};
const parlYear = latestYear(parlRows, "YEAR");
const asmYear = latestYear(asmRows, "YEAR");

// --- Winners per Karnataka PC (latest parliament year) ---
const winners = new Map(); // pc_no -> { mp, party, polled, pcName }
for (const r of parlRows) {
  if (r.STATE !== "Karnataka" || String(r.YEAR).trim() !== String(parlYear)) continue;
  const pcNo = String(parseInt(r.PC_NO, 10)).padStart(3, "0");
  const votes = parseInt(r.VOTES, 10) || 0;
  const cur = winners.get(pcNo) ?? { mp: "", party: "", votes: -1, polled: 0, pcName: "" };
  if (votes > cur.votes) {
    cur.mp = r.CANDIDATE;
    cur.party = r.PARTY;
    cur.votes = votes;
  }
  cur.polled = parseInt(r.polled_votes, 10) || 0;
  if (!cur.pcName) cur.pcName = r.PC_NAME;
  winners.set(pcNo, cur);
}

// --- AC -> PC mapping from the assembly data (districts, segments, electors) ---
const acByNo = new Map(); // ac_no -> { pc, district, electors }
for (const r of asmRows) {
  if (String(r.YEAR).trim() !== String(asmYear)) continue;
  const acNo = String(parseInt(r.AC_NO, 10)).padStart(3, "0");
  if (acByNo.has(acNo)) continue;
  acByNo.set(acNo, {
    pc: normPcName(r.p_constituency),
    district: r.District ?? "",
    electors:
      (parseInt(r.Male_voters, 10) || 0) +
      (parseInt(r.Female_voters, 10) || 0) +
      (parseInt(r.Other_voters, 10) || 0),
  });
}
// Map normalized PC name -> pc_no (from the winners map names)
const pcNoByNormName = new Map();
for (const [pcNo, w] of winners) {
  pcNoByNormName.set(normPcName(w.pcName), pcNo);
}
const pcAgg = new Map(); // pc_no -> { districts:Set, segments:count, electors }
for (const ac of acByNo.values()) {
  const pcNo = pcNoByNormName.get(ac.pc);
  if (!pcNo) continue;
  const agg = pcAgg.get(pcNo) ?? { districts: new Set(), segments: 0, electors: 0 };
  if (ac.district) agg.districts.add(ac.district);
  agg.segments += 1;
  agg.electors += ac.electors;
  pcAgg.set(pcNo, agg);
}

const records = {};
for (const [pcNo, w] of winners) {
  const agg = pcAgg.get(pcNo);
  if (!agg || !w.mp) continue;
  records[pcNo] = {
    pc_no: pcNo,
    pc_name: w.pcName,
    districts: [...agg.districts].sort(),
    assembly_segments: agg.segments,
    mp: w.mp,
    party: w.party,
    election_year: parlYear,
    total_voters: agg.electors,
    voter_turnout: Number(((w.polled / Math.max(1, agg.electors)) * 100).toFixed(2)),
  };
}
console.log(
  `PCs with full data: ${Object.keys(records).length} / 28 (parl year ${parlYear}, asm year ${asmYear})`
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const dest = join(__dirname, "..", "frontend", "src", "data", "karnataka-parliament-elections.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(records, null, 2) + "\n");
console.log(`Wrote ${dest}`);
