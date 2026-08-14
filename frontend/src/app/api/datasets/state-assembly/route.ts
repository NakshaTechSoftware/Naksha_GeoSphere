import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-AC Karnataka election facts (district, Lok Sabha, MLA, party, voters,
// polling stations, turnout), keyed by zero-padded assembly constituency code.
type AssemblyElectionRecord = {
  ac_no: string;
  ac_name: string;
  district: string;
  lok_sabha: string;
  mla: string;
  party: string;
  election_year: number;
  total_voters: number;
  polling_stations: number;
  voter_turnout: number;
};

// Bundled snapshot (scripts/build-karnataka-assembly-elections.mjs) - only used when the
// live source is unreachable, so the panel never goes blank.
const STATIC_ELECTIONS = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'data', 'karnataka-assembly-elections.json'), 'utf8')
) as Record<string, AssemblyElectionRecord>;

// Live source: per-candidate rows compiled from eci.gov.in / results.eci.gov.in (2023,
// and any later election year the file is extended with). Fetched at request time and
// cached briefly, so updated MLA/party/voter figures flow through automatically without
// redeploys - the latest election year present in the data wins.
const ELECTIONS_CSV_URL =
  'https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv';
// Carries PARTY_CODE -> PARTY pairs (abbreviation -> full name) for the parliament data,
// used to expand the assembly CSV's short party codes (BJP/INC/JDS...) to full names.
const PARLIAMENT_CSV_URL =
  'https://data-analytics.github.io/Election_Data_2024/parliament.csv';
const VOTERS_PER_PS = 883; // ECI's 2023 Karnataka average (58,282 PS / 224 ACs)
const LIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-check the sources every 6h

let liveCache: {
  records: Record<string, AssemblyElectionRecord>;
  partyNames: Record<string, string>;
  ts: number;
} | null = null;

// Fallback abbreviation -> full-name map, used only when the parliament CSV is
// unreachable (it covers the parties that have won Karnataka assembly seats).
const COMMON_PARTY_NAMES: Record<string, string> = {
  bjp: 'Bharatiya Janata Party',
  inc: 'Indian National Congress',
  jds: 'Janata Dal (Secular)',
  ind: 'Independent',
  nota: 'None of the Above',
  aap: 'Aam Aadmi Party',
  krs: 'Karnataka Rashtra Samithi',
  bsp: 'Bahujan Samaj Party',
  suci: 'Socialist Unity Centre of India (Communist)',
  sp: 'Samajwadi Party',
  ncp: 'Nationalist Congress Party',
  cpi: 'Communist Party of India',
  cpm: 'Communist Party of India (Marxist)',
  aimim: 'All India Majlis-e-Ittehadul Muslimeen',
  jdu: 'Janata Dal (United)',
  ss: 'Shiv Sena',
};

const normPartyCode = (code: string | undefined): string =>
  (code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Builds a normalized abbreviation -> full-name map from the parliament CSV's
// PARTY_CODE / PARTY columns (latest year only), seeded with the common map.
function buildPartyNames(parlCsv: string): Record<string, string> {
  const map: Record<string, string> = { ...COMMON_PARTY_NAMES };
  try {
    const lines = parlCsv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return map;
    const header = lines[0]!.split(',').map((h) => h.trim());
    const idx: Record<string, number> = Object.fromEntries(header.map((h, i) => [h, i]));
    const yearIdx = idx.YEAR;
    const codeIdx = idx.PARTY_CODE;
    const fullIdx = idx.PARTY;
    if (yearIdx === undefined || codeIdx === undefined || fullIdx === undefined) return map;
    const years = [...new Set(lines.slice(1).map((l) => l.split(',')[yearIdx] ?? '').filter(Boolean))]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
    const latestYear = years.length ? Math.max(...years) : 0;
    for (const line of lines.slice(1)) {
      const c = line.split(',');
      if (String(c[yearIdx] ?? '').trim() !== String(latestYear)) continue;
      const code = normPartyCode(c[codeIdx]);
      const full = (c[fullIdx] ?? '').trim();
      if (code && full) map[code] = full;
    }
  } catch (e) {
    console.warn('[state-assembly] failed to parse party names CSV:', e);
  }
  return map;
}

// Parses the per-candidate CSV into one record per AC for the LATEST election year it
// contains (winner = most votes; turnout = polled / electors; polling stations derived
// from the ECI electors-per-PS norm). Party abbreviations are expanded to full names via
// partyNames. Returns null if the file can't be parsed.
function parseElectionsCsv(
  csv: string,
  partyNames: Record<string, string>
): Record<string, AssemblyElectionRecord> | null {
  try {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return null;
    const header = lines[0]!.split(',').map((h) => h.trim());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const rows = lines.slice(1).map((line) => {
      const cells = line.split(',');
      const row: Record<string, string> = {};
      for (const h of header) {
        const i = idx[h];
        if (i !== undefined) row[h] = cells[i] ?? '';
      }
      return row;
    });

    // Some rows are misaligned (candidate names containing commas shift the columns),
    // so restrict to plausible election years to avoid a shifted vote count winning.
    const years = [...new Set(rows.map((r) => r.YEAR).filter(Boolean))]
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
    const latestYear = years.length ? Math.max(...years) : 0;

    const byAc = new Map<
      string,
      { winner: string; party: string; votes: number; district: string; pc: string; electors: number; polled: number; acName: string }
    >();
    for (const r of rows) {
      if (String(r.YEAR).trim() !== String(latestYear)) continue;
      const acNo = String(parseInt(r.AC_NO ?? '', 10)).padStart(3, '0');
      const votes = parseInt(r.VOTES ?? '', 10) || 0;
      const cur = byAc.get(acNo) ?? {
        winner: '',
        party: '',
        votes: -1,
        district: (r.District ?? '').trim(),
        pc: (r.p_constituency ?? '').trim(),
        electors:
          (parseInt(r.Male_voters ?? '', 10) || 0) +
          (parseInt(r.Female_voters ?? '', 10) || 0) +
          (parseInt(r.Other_voters ?? '', 10) || 0),
        polled: parseInt(r.polled_votes ?? '', 10) || 0,
        acName: (r.AC_NAME ?? '').trim(),
      };
      if (votes > cur.votes) {
        cur.winner = (r.NAME ?? '').trim();
        cur.party = (r.PARTY ?? '').trim();
        cur.votes = votes;
      }
      if (!cur.acName) cur.acName = (r.AC_NAME ?? '').trim();
      byAc.set(acNo, cur);
    }

    const records: Record<string, AssemblyElectionRecord> = {};
    for (const [acNo, d] of byAc) {
      if (!d.acName || !d.winner) continue;
      records[acNo] = {
        ac_no: acNo,
        ac_name: d.acName,
        district: d.district,
        lok_sabha: d.pc,
        mla: d.winner,
        party: partyNames[normPartyCode(d.party)] ?? d.party,
        election_year: latestYear,
        total_voters: d.electors,
        polling_stations: Math.max(1, Math.round(d.electors / VOTERS_PER_PS)),
        voter_turnout: Number(((d.polled / Math.max(1, d.electors)) * 100).toFixed(2)),
      };
    }
    return Object.keys(records).length >= 200 ? records : null; // sanity: all 224 ACs
  } catch (e) {
    console.warn(`[state-assembly] failed to parse election CSV:`, e);
    return null;
  }
}

// Returns the freshest election records available: the live CSV when reachable (cached
// for a few hours), otherwise the bundled snapshot.
async function loadKarnatakaElections(): Promise<Record<string, AssemblyElectionRecord>> {
  if (liveCache && Date.now() - liveCache.ts < LIVE_CACHE_TTL_MS) {
    return liveCache.records;
  }
  try {
    const fetchCsv = async (url: string): Promise<string> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } finally {
        clearTimeout(timer);
      }
    };
    const [csv, parlCsv] = await Promise.all([
      fetchCsv(ELECTIONS_CSV_URL),
      fetchCsv(PARLIAMENT_CSV_URL),
    ]);
    const partyNames = buildPartyNames(parlCsv);
    const parsed = parseElectionsCsv(csv, partyNames);
    if (parsed) {
      liveCache = { records: parsed, partyNames, ts: Date.now() };
      return parsed;
    }
    throw new Error('CSV parse produced no records');
  } catch (e) {
    console.warn(
      `[state-assembly] live election CSV unavailable (${e instanceof Error ? e.message : e}), using bundled data`
    );
    return liveCache?.records ?? STATIC_ELECTIONS;
  }
}

// The KML-to-GeoJSON description embeds the AC code as an HTML table row, e.g.
// "<td>AC_CODE</td><td>077</td>". Extract the code; fall back to matching by name.
function assemblyCodeFromFeature(
  properties: Record<string, unknown> | undefined,
  elections: Record<string, AssemblyElectionRecord>
): string | null {
  const description =
    typeof properties?.description === 'string' ? properties.description : '';
  const code = description.match(/AC_CODE\s*<\/td>\s*<td>\s*(\d+)/i)?.[1];
  if (code) return String(parseInt(code, 10)).padStart(3, '0');

  const name = typeof properties?.name === 'string' ? properties.name.trim() : '';
  if (!name) return null;
  return (
    Object.values(elections).find(
      (rec) => rec.ac_name.toLowerCase() === name.toLowerCase()
    )?.ac_no ?? null
  );
}

// Remote MinIO configuration
const MINIO_ENDPOINT = '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

// Maps a state name (as it appears in india_states.geojson's st_nm property) to the MinIO
// key holding that state's assembly constituency boundaries. Only states with assembly
// constituency data uploaded to MinIO are listed here.
const STATE_ASSEMBLY_KEYS: Record<string, string> = {
  karnataka: 'Assembly Constituency Boundaries/India/Karnataka/Assembly_Constituency_Boundary_Karnataka.geojson',
};

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get('state');
    const key = state ? STATE_ASSEMBLY_KEYS[state.trim().toLowerCase()] : undefined;

    if (!key) {
      return NextResponse.json(
        { error: `No assembly constituency data available for "${state ?? ''}"` },
        { status: 404 }
      );
    }

    const s3Client = new S3Client({
      endpoint: `http://${MINIO_ENDPOINT}`,
      region: S3_REGION,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Required for MinIO
    });

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    const fileResponse = await fetch(presignedUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (!fileResponse.ok) {
      console.error(`Failed to fetch assembly constituency geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = JSON.parse(await fileResponse.text()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };

    // Enrich each assembly constituency feature with its latest election facts
    // (matched by the AC code embedded in the KML description). Best-effort: an
    // unmatched feature keeps its raw KML properties and still renders.
    const elections = await loadKarnatakaElections();
    const stateName = state?.trim() ?? '';
    let matched = 0;
    for (const feature of geojson.features ?? []) {
      const code = assemblyCodeFromFeature(feature.properties, elections);
      const record = code ? elections[code] : undefined;
      if (!record || !feature.properties) continue;
      feature.properties['state'] = stateName;
      feature.properties['district'] = record.district;
      feature.properties['lok_sabha'] = record.lok_sabha;
      feature.properties['mla'] = record.mla;
      feature.properties['party'] = record.party;
      feature.properties['election_year'] = record.election_year;
      feature.properties['total_voters'] = record.total_voters;
      feature.properties['polling_stations'] = record.polling_stations;
      feature.properties['voter_turnout'] = record.voter_turnout;
      matched++;
    }
    console.log(
      `[state-assembly] enriched ${matched}/${geojson.features?.length ?? 0} features for "${stateName}"`
    );

    return new NextResponse(JSON.stringify(geojson), {
      headers: {
        'Content-Type': 'application/geo+json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Error fetching state assembly constituency boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load assembly constituency boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check if MinIO storage at 192.168.10.81:9010 is accessible',
      },
      { status: 500 }
    );
  }
}
