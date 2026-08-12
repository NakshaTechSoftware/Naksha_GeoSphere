import { NextRequest, NextResponse } from "next/server";
import { dropdownOptions, matchOption, parseOwners, type RtcOwner } from "../_bhoomi";

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
const BHOOMI_URL = "https://landrecords.karnataka.gov.in/Service2/";
const PREFIX = "ctl00$MainContent$";
// Bhoomi's own "Fetch details" step regularly takes well over half a minute.
const REQUEST_TIMEOUT_MS = 90_000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; owners: RtcOwner[] }>();

type ParcelParams = {
  district: string;
  taluk: string;
  hobli: string;
  village: string;
  survey: string;
  surnoc: string;
  hissa: string;
};

// A single live Bhoomi form session: the cookie plus the last page's HTML, which is where
// the next postback's hidden fields and dropdown options come from.
class BhoomiSession {
  private cookie = "";
  html = "";

  async open() {
    const res = await fetch(BHOOMI_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    this.cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    this.html = await res.text();
  }

  // One postback. `extra` carries the current value of every dropdown rendered so far plus
  // either __EVENTTARGET (dropdown change) or a submit button's name/value (Go / Fetch).
  async post(extra: Record<string, string>, step = "postback") {
    const body = new URLSearchParams({
      __EVENTTARGET: "",
      __EVENTARGUMENT: "",
      __VIEWSTATE: this.hidden("__VIEWSTATE"),
      __VIEWSTATEGENERATOR: this.hidden("__VIEWSTATEGENERATOR"),
      __VIEWSTATEENCRYPTED: "",
      __EVENTVALIDATION: this.hidden("__EVENTVALIDATION"),
      ...extra,
    });
    const res = await fetch(BHOOMI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        Cookie: this.cookie,
        Referer: BHOOMI_URL,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch((error) => {
      throw new Error(`Bhoomi "${step}" step failed: ${error.message}`);
    });
    if (!res.ok) throw new Error(`Bhoomi "${step}" step returned ${res.status}`);
    this.html = await res.text();
  }

  private hidden(name: string): string {
    return (this.html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] ?? "";
  }

  options(id: string): { value: string; text: string }[] {
    return dropdownOptions(this.html, id);
  }
}

async function prepareSurvey(p: ParcelParams) {
  const session = new BhoomiSession();
  await session.open();

  // Every postback must echo back the values of the dropdowns rendered so far; ASP.NET
  // event validation rejects the request otherwise.
  const form: Record<string, string> = { [`${PREFIX}txtCSurveyNo`]: "" };

  // Each cascading step: resolve the name to the option Bhoomi rendered, then post it.
  const step = async (control: string, name: string, label: string) => {
    const value = matchOption(session.options(control), name);
    if (!value) throw new Error(`${label} "${name}" not found in Bhoomi records`);
    form[PREFIX + control] = value;
    await session.post({ ...form, __EVENTTARGET: PREFIX + control }, label);
  };

  await step("ddlCDistrict", p.district, "District");
  await step("ddlCTaluk", p.taluk, "Taluk");
  await step("ddlCHobli", p.hobli, "Hobli");
  await step("ddlCVillage", p.village, "Village");

  // The survey-number box has AutoPostBack; without replaying that postback the Go button
  // reports "please Enter SurveyNo" and leaves the surnoc/hissa dropdowns disabled.
  form[`${PREFIX}txtCSurveyNo`] = p.survey;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}txtCSurveyNo` }, "survey number");
  await session.post({ ...form, [`${PREFIX}btnCGo`]: "Go" }, "Go");

  return { session, form };
}

async function prepareSurnoc(
  p: ParcelParams,
  surnoc: { value: string; text: string },
) {
  const prepared = await prepareSurvey(p);
  const current =
    prepared.session.options("ddlCSurnocNo").find((option) => option.value === surnoc.value) ??
    prepared.session.options("ddlCSurnocNo").find(
      (option) => matchOption([option], surnoc.text) === option.value,
    );
  if (!current) throw new Error(`Surnoc "${surnoc.text}" not found in Bhoomi records`);
  prepared.form[`${PREFIX}ddlCSurnocNo`] = current.value;
  await prepared.session.post(
    { ...prepared.form, __EVENTTARGET: `${PREFIX}ddlCSurnocNo` },
    `Surnoc ${current.text}`,
  );
  return prepared;
}

async function fetchPreparedHissa(
  session: BhoomiSession,
  form: Record<string, string>,
  hissa: { value: string; text: string },
): Promise<RtcOwner[]> {
  form[`${PREFIX}ddlCHissaNo`] = hissa.value;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}ddlCHissaNo` }, `Hissa ${hissa.text}`);

  // Period and year default to the current record.
  const period = session.options("ddlCPeriod")[0];
  if (!period) throw new Error("No RTC period available for this parcel");
  form[`${PREFIX}ddlCPeriod`] = period.value;
  await session.post({ ...form, __EVENTTARGET: `${PREFIX}ddlCPeriod` }, "period");
  const year = session.options("ddlCYear")[0];
  if (year) form[`${PREFIX}ddlCYear`] = year.value;

  await session.post({ ...form, [`${PREFIX}btnCFetchDetails`]: "Fetch details" }, "fetch details");
  return parseOwners(session.html).map((owner) => ({ ...owner, hissa: hissa.text }));
}

async function fetchOwners(p: ParcelParams): Promise<RtcOwner[]> {
  const initial = await prepareSurvey(p);
  const availableSurnocs = initial.session.options("ddlCSurnocNo");
  const allSurnocs = p.surnoc.trim() === "*" || p.surnoc.trim().toUpperCase() === "XX";
  const selectedSurnocs = allSurnocs
    ? availableSurnocs
    : availableSurnocs.filter(
        (option) => matchOption([option], p.surnoc) === option.value,
      );
  if (selectedSurnocs.length === 0) {
    throw new Error(`Surnoc "${p.surnoc}" not found in Bhoomi records`);
  }

  const allHissas = p.hissa.trim() === "*" || p.hissa.trim().toUpperCase() === "XX";
  const owners: RtcOwner[] = [];
  for (const surnoc of selectedSurnocs) {
    const hissaProbe = await prepareSurnoc(p, surnoc);
    const availableHissas = hissaProbe.session.options("ddlCHissaNo");
    const selectedHissas = allHissas
      ? availableHissas
      : availableHissas.filter(
          (option) => matchOption([option], p.hissa) === option.value,
        );
    if (selectedHissas.length === 0) continue;

    for (const hissa of selectedHissas) {
      // Fetch details mutates WebForms state, so start a fresh chain for every combination.
      const prepared = await prepareSurnoc(p, surnoc);
      const currentHissa =
        prepared.session
          .options("ddlCHissaNo")
          .find((option) => option.value === hissa.value) ?? hissa;
      owners.push(
        ...(await fetchPreparedHissa(prepared.session, prepared.form, currentHissa)),
      );
    }
  }
  if (owners.length === 0) {
    throw new Error(
      `No Bhoomi owner records found for survey "${p.survey}" (surnoc "${p.surnoc}", hissa "${p.hissa}")`,
    );
  }
  return owners;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const params = {
    district: q.get("district") ?? "",
    taluk: q.get("taluk") ?? "",
    hobli: q.get("hobli") ?? "",
    village: q.get("village") ?? "",
    survey: q.get("survey") ?? "",
    // A cadastral wildcard means all Bhoomi dropdown options for this survey.
    surnoc: q.get("surnoc") ?? "*",
    hissa: q.get("hissa") ?? "*",
  };
  const missing = (["district", "taluk", "hobli", "village", "survey"] as const).filter(
    (k) => !params[k].trim(),
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required parameter(s): ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  const key = Object.values(params).join("|").toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ owners: hit.owners, cached: true });
  }

  try {
    const owners = await fetchOwners(params);
    cache.set(key, { at: Date.now(), owners });
    return NextResponse.json({ owners });
  } catch (error) {
    console.error("[land-records/rtc] Bhoomi lookup failed:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch land records from Bhoomi",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
