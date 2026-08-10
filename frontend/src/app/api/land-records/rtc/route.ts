import { NextRequest, NextResponse } from 'next/server';
import {
  dropdownOptions,
  matchOption,
  parseOwners,
  type RtcOwner,
} from '../_bhoomi';

// Owner names are NOT part of the KGIS cadastral GeoJSON we render on the map - that data
// only carries survey/hissa identifiers. The names live in Bhoomi (the state land-records
// system), reachable only through the public RTC page at Service2/, an ASP.NET WebForms
// form with cascading dropdowns. So we replay the same postback sequence a browser would:
//
//   district -> taluk -> hobli -> village -> survey no (autopostback) -> Go
//            -> surnoc -> hissa -> period -> Fetch details
//
// Each step needs the __VIEWSTATE/__EVENTVALIDATION pair from the previous response, so the
// steps are strictly sequential (~8 round trips, several seconds). Results are cached per
// parcel to keep repeated right-clicks off the government server.
const BHOOMI_URL = 'https://landrecords.karnataka.gov.in/Service2/';
const PREFIX = 'ctl00$MainContent$';
// Bhoomi's own "Fetch details" step regularly takes well over half a minute.
const REQUEST_TIMEOUT_MS = 90_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; owners: RtcOwner[] }>();

// A single live Bhoomi form session: the cookie plus the last page's HTML, which is where
// the next postback's hidden fields and dropdown options come from.
class BhoomiSession {
  private cookie = '';
  html = '';

  async open() {
    const res = await fetch(BHOOMI_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.cookie = (res.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    this.html = await res.text();
  }

  // One postback. `extra` carries the current value of every dropdown rendered so far plus
  // either __EVENTTARGET (dropdown change) or a submit button's name/value (Go / Fetch).
  async post(extra: Record<string, string>, step = 'postback') {
    const body = new URLSearchParams({
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      __VIEWSTATE: this.hidden('__VIEWSTATE'),
      __VIEWSTATEGENERATOR: this.hidden('__VIEWSTATEGENERATOR'),
      __VIEWSTATEENCRYPTED: '',
      __EVENTVALIDATION: this.hidden('__EVENTVALIDATION'),
      ...extra,
    });
    const res = await fetch(BHOOMI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        Cookie: this.cookie,
        Referer: BHOOMI_URL,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((error) => {
      throw new Error(`Bhoomi "${step}" step failed: ${error.message}`);
    });
    if (!res.ok) throw new Error(`Bhoomi "${step}" step returned ${res.status}`);
    this.html = await res.text();
  }

  private hidden(name: string): string {
    return (this.html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] ?? '';
  }

  options(id: string): { value: string; text: string }[] {
    return dropdownOptions(this.html, id);
  }
}

async function fetchOwners(p: {
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  survey: string;
  surnoc: string;
  hissa: string;
}): Promise<RtcOwner[]> {
  const session = new BhoomiSession();
  await session.open();

  // Every postback must echo back the values of the dropdowns rendered so far; ASP.NET
  // event validation rejects the request otherwise.
  const form: Record<string, string> = { [`${PREFIX}txtCSurveyNo`]: '' };

  // Each cascading step: resolve the name to the option Bhoomi rendered, then post it.
  const step = async (control: string, name: string, label: string) => {
    const value = matchOption(session.options(control), name);
    if (!value) throw new Error(`${label} "${name}" not found in Bhoomi records`);
    form[PREFIX + control] = value;
    await session.post({ ...form, __EVENTTARGET: PREFIX + control }, label);
  };

  await step('ddlCDistrict', p.district, 'District');
  await step('ddlCTaluk', p.taluk, 'Taluk');
  await step('ddlCHobli', p.hobli, 'Hobli');
  await step('ddlCVillage', p.village, 'Village');

  // The survey-number box has AutoPostBack; without replaying that postback the Go button
  // reports "please Enter SurveyNo" and leaves the surnoc/hissa dropdowns disabled.
  form[`${PREFIX}txtCSurveyNo`] = p.survey;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}txtCSurveyNo` }, 'survey number');
  await session.post({ ...form, [`${PREFIX}btnCGo`]: 'Go' }, 'Go');

  await step('ddlCSurnocNo', p.surnoc, 'Surnoc');
  await step('ddlCHissaNo', p.hissa, 'Hissa');

  // Period and year default to the current record.
  const period = session.options('ddlCPeriod')[0];
  if (!period) throw new Error('No RTC period available for this parcel');
  form[`${PREFIX}ddlCPeriod`] = period.value;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}ddlCPeriod` }, 'period');
  const year = session.options('ddlCYear')[0];
  if (year) form[`${PREFIX}ddlCYear`] = year.value;

  await session.post({ ...form, [`${PREFIX}btnCFetchDetails`]: 'Fetch details' }, 'fetch details');
  return parseOwners(session.html);
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const params = {
    district: q.get('district') ?? '',
    taluk: q.get('taluk') ?? '',
    hobli: q.get('hobli') ?? '',
    village: q.get('village') ?? '',
    survey: q.get('survey') ?? '',
    // A parcel with no subdivision carries "*" in both fields, which is exactly what the
    // Bhoomi dropdowns offer, so the cadastral values pass through unchanged.
    surnoc: q.get('surnoc') ?? '*',
    hissa: q.get('hissa') ?? '*',
  };
  const missing = (['district', 'taluk', 'hobli', 'village', 'survey'] as const).filter(
    (k) => !params[k].trim()
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required parameter(s): ${missing.join(', ')}` },
      { status: 400 }
    );
  }

  const key = Object.values(params).join('|').toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ owners: hit.owners, cached: true });
  }

  try {
    const owners = await fetchOwners(params);
    cache.set(key, { at: Date.now(), owners });
    return NextResponse.json({ owners });
  } catch (error) {
    console.error('[land-records/rtc] Bhoomi lookup failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch land records from Bhoomi',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
