import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-PC Karnataka election facts (districts, assembly segments, MP, party, voters,
// turnout), keyed by zero-padded parliamentary constituency code.
type ParliamentElectionRecord = {
  pc_no: string;
  pc_name: string;
  districts: string[];
  assembly_segments: number;
  mp: string;
  party: string;
  election_year: number;
  total_voters: number;
  voter_turnout: number;
};

// Bundled snapshot (scripts/build-karnataka-parliament-elections.mjs) - used only when
// the live sources are unreachable, so the panel never goes blank.
const STATIC_ELECTIONS = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'data', 'karnataka-parliament-elections.json'), 'utf8')
) as Record<string, ParliamentElectionRecord>;

// Live sources (per-candidate rows compiled from eci.gov.in / results.eci.gov.in):
//   - parliament.csv: all-India Lok Sabha results -> MP, party, polled votes (2024).
//   - assembly CSV: each AC's p_constituency, District and electors -> a PC's assembly
//     segments, districts and total voters (summed from its ACs). Latest election year
//     present in each file wins, so future elections flow through automatically.
const PARLIAMENT_CSV_URL =
  'https://data-analytics.github.io/Election_Data_2024/parliament.csv';
const ASSEMBLY_CSV_URL =
  'https://data-analytics.github.io/Election_Data_2023/Karnataka_counting.csv';
const LIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-check the sources every 6h

let liveCache: { records: Record<string, ParliamentElectionRecord>; ts: number } | null = null;

// Known spelling variants between the sources' PC names (the assembly CSV uses the older
// transliteration, the parliament CSV the official one).
const PC_NAME_ALIASES: Record<string, string> = {
  davangere: 'davanagere',
  chikballapur: 'chikkballapur',
};
const normPcName = (name: string | undefined): string => {
  const norm = (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return PC_NAME_ALIASES[norm] ?? norm;
};

type CsvRow = Record<string, string>;

function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: CsvRow = {};
    for (const h of header) {
      const i = idx[h];
      if (i !== undefined) row[h] = (cells[i] ?? '').trim();
    }
    return row;
  });
}

// Plausible-election-year filter guards against misaligned CSV rows (candidate names
// containing commas shift the columns, pushing a vote count into the YEAR column).
function latestYear(rows: CsvRow[], key: string): number {
  const years = [...new Set(rows.map((r) => r[key]).filter(Boolean))]
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1950 && n <= 2100);
  return years.length ? Math.max(...years) : 0;
}

// Builds the per-PC records from the live CSVs, or returns null on any failure.
function buildParliamentRecords(
  parlRows: CsvRow[],
  asmRows: CsvRow[]
): Record<string, ParliamentElectionRecord> | null {
  try {
    const parlYear = latestYear(parlRows, 'YEAR');
    const asmYear = latestYear(asmRows, 'YEAR');
    if (!parlYear || !asmYear) return null;

    // Winners per Karnataka PC (latest parliament year).
    const winners = new Map<
      string,
      { mp: string; party: string; votes: number; polled: number; pcName: string }
    >();
    for (const r of parlRows) {
      if (r.STATE !== 'Karnataka' || String(r.YEAR).trim() !== String(parlYear)) continue;
      const pcNo = String(parseInt(r.PC_NO ?? '', 10)).padStart(3, '0');
      const votes = parseInt(r.VOTES ?? '', 10) || 0;
      const cur = winners.get(pcNo) ?? {
        mp: '',
        party: '',
        votes: -1,
        polled: 0,
        pcName: r.PC_NAME ?? '',
      };
      if (votes > cur.votes) {
        cur.mp = r.CANDIDATE ?? '';
        cur.party = r.PARTY ?? '';
        cur.votes = votes;
      }
      cur.polled = parseInt(r.polled_votes ?? '', 10) || 0;
      if (!cur.pcName) cur.pcName = r.PC_NAME ?? '';
      winners.set(pcNo, cur);
    }

    // One entry per AC (electors must not be double-counted across candidate rows).
    const acByNo = new Map<string, { pc: string; district: string; electors: number }>();
    for (const r of asmRows) {
      if (String(r.YEAR).trim() !== String(asmYear)) continue;
      const acNo = String(parseInt(r.AC_NO ?? '', 10)).padStart(3, '0');
      if (acByNo.has(acNo)) continue;
      acByNo.set(acNo, {
        pc: normPcName(r.p_constituency),
        district: r.District ?? '',
        electors:
          (parseInt(r.Male_voters ?? '', 10) || 0) +
          (parseInt(r.Female_voters ?? '', 10) || 0) +
          (parseInt(r.Other_voters ?? '', 10) || 0),
      });
    }

    const pcNoByNormName = new Map<string, string>();
    for (const [pcNo, w] of winners) pcNoByNormName.set(normPcName(w.pcName), pcNo);

    const pcAgg = new Map<string, { districts: Set<string>; segments: number; electors: number }>();
    for (const ac of acByNo.values()) {
      const pcNo = pcNoByNormName.get(ac.pc);
      if (!pcNo) continue;
      const agg = pcAgg.get(pcNo) ?? { districts: new Set<string>(), segments: 0, electors: 0 };
      if (ac.district) agg.districts.add(ac.district);
      agg.segments += 1;
      agg.electors += ac.electors;
      pcAgg.set(pcNo, agg);
    }

    const records: Record<string, ParliamentElectionRecord> = {};
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
    return Object.keys(records).length >= 28 ? records : null; // sanity: all 28 PCs
  } catch (e) {
    console.warn('[state-parliament] failed to build records from live CSVs:', e);
    return null;
  }
}

async function fetchCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// Returns the freshest records available: built from the live CSVs (cached for a few
// hours), otherwise the bundled snapshot.
async function loadKarnatakaParliamentElections(): Promise<Record<string, ParliamentElectionRecord>> {
  if (liveCache && Date.now() - liveCache.ts < LIVE_CACHE_TTL_MS) {
    return liveCache.records;
  }
  try {
    const [parlCsv, asmCsv] = await Promise.all([
      fetchCsv(PARLIAMENT_CSV_URL),
      fetchCsv(ASSEMBLY_CSV_URL),
    ]);
    const records = buildParliamentRecords(parseCsv(parlCsv), parseCsv(asmCsv));
    if (records) {
      liveCache = { records, ts: Date.now() };
      return records;
    }
    throw new Error('live CSV parse produced no records');
  } catch (e) {
    console.warn(
      `[state-parliament] live election CSVs unavailable (${e instanceof Error ? e.message : e}), using bundled data`
    );
    return liveCache?.records ?? STATIC_ELECTIONS;
  }
}

// The KML-to-GeoJSON description embeds the PC code as an HTML table row, e.g.
// "<td>PC_Code</td><td>015</td>". Extract the code; fall back to matching by name.
function pcCodeFromFeature(
  properties: Record<string, unknown> | undefined,
  elections: Record<string, ParliamentElectionRecord>
): string | null {
  const description = typeof properties?.description === 'string' ? properties.description : '';
  const code = description.match(/PC[_ ]?Code\s*<\/td>\s*<td>\s*(\d+)/i)?.[1];
  if (code) return String(parseInt(code, 10)).padStart(3, '0');

  const name = typeof properties?.name === 'string' ? properties.name.trim() : '';
  if (!name) return null;
  const norm = normPcName(name);
  return (
    Object.values(elections).find((rec) => normPcName(rec.pc_name) === norm)?.pc_no ?? null
  );
}

// Remote MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? '192.168.10.81:9010';
const MINIO_ACCESS_KEY = 'geosphere_storage';
const MINIO_SECRET_KEY = '706f803f67c143c884305e7085b59210ffb29ac69e724a70';
const S3_REGION = 'geosphere';
const S3_BUCKET = 'geosphere-source-data';

// Maps a state name (as it appears in india_states.geojson's st_nm property) to the MinIO
// key holding that state's parliamentary constituency boundaries. Only states with
// parliamentary constituency data uploaded to MinIO are listed here.
const STATE_PARLIAMENT_KEYS: Record<string, string> = {
  karnataka: 'Parliamentary Constituency Boundaries/India/Karnataka/Parliamentary_Constituency_Boundary_Karnataka.geojson',
};

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get('state');
    const key = state ? STATE_PARLIAMENT_KEYS[state.trim().toLowerCase()] : undefined;

    if (!key) {
      return NextResponse.json(
        { error: `No parliamentary constituency data available for "${state ?? ''}"` },
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
      console.error(`Failed to fetch parliamentary constituency geojson from MinIO: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`MinIO returned ${fileResponse.status}`);
    }

    const geojson = JSON.parse(await fileResponse.text()) as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };

    // Enrich each parliamentary constituency feature with its latest election facts
    // (matched by the PC code embedded in the KML description). Best-effort: an
    // unmatched feature keeps its raw KML properties and still renders.
    const elections = await loadKarnatakaParliamentElections();
    const stateName = state?.trim() ?? '';
    let matched = 0;
    for (const feature of geojson.features ?? []) {
      const code = pcCodeFromFeature(feature.properties, elections);
      const record = code ? elections[code] : undefined;
      if (!record || !feature.properties) continue;
      feature.properties['state'] = stateName;
      feature.properties['districts'] = record.districts.join(', ');
      feature.properties['assembly_segments'] = record.assembly_segments;
      feature.properties['mp'] = record.mp;
      feature.properties['party'] = record.party;
      feature.properties['election_year'] = record.election_year;
      feature.properties['total_voters'] = record.total_voters;
      feature.properties['voter_turnout'] = record.voter_turnout;
      matched++;
    }
    console.log(
      `[state-parliament] enriched ${matched}/${geojson.features?.length ?? 0} features for "${stateName}"`
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
    console.error('Error fetching state parliamentary constituency boundaries:', error);
    return NextResponse.json(
      {
        error: 'Failed to load parliamentary constituency boundaries',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: `Check if MinIO storage at ${MINIO_ENDPOINT} is accessible`,
      },
      { status: 500 }
    );
  }
}
