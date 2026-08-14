#!/usr/bin/env node
/**
 * Builds frontend/src/data/karnataka-assembly-elections.json — per-assembly-constituency
 * 2023 Karnataka election facts used to enrich the Assembly Constituency Boundaries
 * attribute panel (State, District, Lok Sabha, MLA, Party, Election Year, Total Voters,
 * Polling Stations, Voter Turnout).
 *
 * Source: https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv
 * (per-candidate rows compiled from eci.gov.in / results.eci.gov.in by Sushanth).
 *
 * - Winner = candidate with the most votes in each AC for YEAR=2023.
 * - Total voters = Male + Female + Other electors.
 * - Voter turnout = total polled votes / total voters.
 * - Polling stations = round(total voters / 883) — ECI's published 2023 Karnataka
 *   average of 883 electors per polling station (58,282 PS across 224 ACs).
 *
 * Output is keyed by zero-padded AC code (e.g. "077"), matching the AC_CODE parsed from
 * the KML description of each assembly boundary feature.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSV_URL = "https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv";
// Carries PARTY_CODE -> PARTY pairs (abbreviation -> full name) used to expand the
// assembly CSV's short party codes (BJP/INC/JDS...) to full names.
const PARLIAMENT_CSV_URL =
  "https://data-analytics.github.io/Election_Data_2024/parliament.csv";
const VOTERS_PER_PS = 883; // ECI 2023 Karnataka state average

const [csv, parlCsv] = await Promise.all([
  (await fetch(CSV_URL)).text(),
  (await fetch(PARLIAMENT_CSV_URL)).text(),
]);
const lines = csv.split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",").map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const rows = lines.slice(1).map((line) => {
  const cells = line.split(",");
  const row = {};
  for (const h of header) row[h] = cells[idx[h]];
  return row;
});

// Abbreviation -> full party name map (latest parliament year only), mirroring the
// state-assembly API route's live logic so the bundled snapshot matches.
const normCode = (code) => (code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const partyNames = {};
{
  const pl = parlCsv.split(/\r?\n/).filter(Boolean);
  if (pl.length >= 2) {
    const ph = pl[0].split(",").map((h) => h.trim());
    const pidx = Object.fromEntries(ph.map((h, i) => [h, i]));
    const py = [...new Set(pl.slice(1).map((l) => l.split(",")[pidx.YEAR]).filter(Boolean))]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
    const pyLatest = py.length ? Math.max(...py) : 0;
    for (const line of pl.slice(1)) {
      const c = line.split(",");
      if (String(c[pidx.YEAR]).trim() !== String(pyLatest)) continue;
      const code = normCode(c[pidx.PARTY_CODE]);
      const full = (c[pidx.PARTY] ?? "").trim();
      if (code && full) partyNames[code] = full;
    }
  }
}

// Always take the LATEST election year the file contains, so the bundled snapshot stays
// in step with the live data when a future election extends the CSV. Some rows are
// misaligned (candidate names containing commas shift the columns), so restrict to
// plausible election years rather than taking the numeric max of everything.
const years = [...new Set(rows.map((r) => r.YEAR).filter(Boolean))]
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
const latestYear = years.length ? Math.max(...years) : 2023;

const byAc = new Map(); // ac_no -> { winner, party, votes, district, pc, electors, polled }
for (const r of rows) {
  if (String(r.YEAR).trim() !== String(latestYear)) continue;
  const acNo = String(parseInt(r.AC_NO, 10)).padStart(3, "0");
  const votes = parseInt(r.VOTES, 10) || 0;
  const cur = byAc.get(acNo) ?? {
    winner: "",
    party: "",
    votes: -1,
    district: r.District?.trim() ?? "",
    pc: r.p_constituency?.trim() ?? "",
    electors:
      (parseInt(r.Male_voters, 10) || 0) +
      (parseInt(r.Female_voters, 10) || 0) +
      (parseInt(r.Other_voters, 10) || 0),
    polled: parseInt(r.polled_votes, 10) || 0,
  };
  if (votes > cur.votes) {
    cur.winner = r.NAME.trim();
    cur.party = partyNames[normCode(r.PARTY)] ?? r.PARTY.trim();
    cur.votes = votes;
  }
  byAc.set(acNo, cur);
}

const records = {};
for (const [acNo, d] of [...byAc.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const turnout = d.electors > 0 ? (d.polled / d.electors) * 100 : 0;
  records[acNo] = {
    ac_no: acNo,
    ac_name: d.winner ? undefined : undefined, // filled below via the winner's AC name
    district: d.district,
    lok_sabha: d.pc,
    mla: d.winner,
    party: d.party,
    election_year: latestYear,
    total_voters: d.electors,
    polling_stations: Math.max(1, Math.round(d.electors / VOTERS_PER_PS)),
    voter_turnout: Number(turnout.toFixed(2)),
  };
}

// Attach the AC name from the first row of each AC in the selected year (AC_NAME column).
for (const r of rows) {
  if (String(r.YEAR).trim() !== String(latestYear)) continue;
  const acNo = String(parseInt(r.AC_NO, 10)).padStart(3, "0");
  const rec = records[acNo];
  if (rec && !rec.ac_name) rec.ac_name = r.AC_NAME.trim();
}

const out = Object.fromEntries(
  Object.entries(records).filter(([, v]) => v.ac_name && v.mla)
);
console.log(`ACs with full data: ${Object.keys(out).length} / 224`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const dest = join(__dirname, "..", "frontend", "src", "data", "karnataka-assembly-elections.json");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${dest}`);
