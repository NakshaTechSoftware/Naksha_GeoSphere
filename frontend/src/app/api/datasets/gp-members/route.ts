import { NextRequest, NextResponse } from "next/server";

/**
 * Fetches elected representative (GP member) data from the Karnataka
 * Panchamitra portal. The endpoint is public — no auth required.
 *
 * Query params:
 *   district — district name (e.g. "Chikkamagaluru")
 *   gpName   — gram panchayat name to fuzzy-match against address_en
 */
const PANCHAMITRA_URL =
  "https://panchatantra.karnataka.gov.in/USER_MODULE/gpDashboard/getOperationWebService";

// District name → Panchamitra zp_id mapping
const DISTRICT_ZP_MAP: Record<string, string> = {
  BAGALKOTE: "1501",
  BENGALURU: "1502",
  "BENGALURU RURAL": "1503",
  BELAGAVI: "1504",
  BALLARI: "1505",
  BIDAR: "1506",
  VIJAYAPURA: "1507",
  CHAMARAJANAGARA: "1508",
  CHIKKAMAGALURU: "1509",
  CHITRADURGA: "1510",
  "DAKSHINA KANNADA": "1511",
  DAVANAGERE: "1512",
  DHARWAR: "1513",
  GADAG: "1514",
  KALABURAGI: "1515",
  HASSAN: "1516",
  HAVERI: "1517",
  KODAGU: "1518",
  KOLAR: "1519",
  KOPPAL: "1520",
  MANDYA: "1521",
  MYSURU: "1522",
  RAICHUR: "1523",
  SHIVAMOGGA: "1524",
  TUMAKURU: "1525",
  UDUPI: "1526",
  "UTTARA KANNADA": "1527",
  CHIKKABALLAPURA: "1528",
  "BENGALURU SOUTH": "1529",
  YADGIR: "1530",
  VIJAYANAGAR: "1531",
};

interface PanchamitraMember {
  emp_name_en?: string;
  emp_name_kn?: string;
  designation?: string;
  designation_kn?: string;
  address_en?: string;
  category?: string;
  email_id?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const district = request.nextUrl.searchParams.get("district");
  const gpName = request.nextUrl.searchParams.get("gpName");
  const taluk = request.nextUrl.searchParams.get("taluk");
  const villages = request.nextUrl.searchParams.get("villages");

  if (!district || !gpName) {
    return NextResponse.json(
      { error: "district and gpName are required" },
      { status: 400 },
    );
  }

  // Resolve district name to zp_id
  const normDistrict = district.trim().toUpperCase();
  const districtId = DISTRICT_ZP_MAP[normDistrict];
  if (!districtId) {
    return NextResponse.json(
      { error: `Unknown district: ${district}` },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${PANCHAMITRA_URL}?serviceName=getStaffDetailsForBeforeLogin&serviceType=MASTER`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zp_id: districtId,
          tp_id: "",
          gp_id: "",
          access_level: "4",
          category_id: "5", // Elected Representatives
          start_index: "0",
          end_index: "",
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Panchamitra returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const raw = data.responseData;
    if (!raw) {
      return NextResponse.json({ memberName: null, allMembers: [] });
    }
    const members: PanchamitraMember[] = typeof raw === "string" ? JSON.parse(raw) : raw;

    // Build a set of village names for matching (lowercase, stripped)
    const villageSet = new Set<string>();
    if (villages) {
      villages.split(",").forEach((v) => {
        const trimmed = v.trim();
        if (trimmed) villageSet.add(normalize(trimmed));
      });
    }
    const normGp = normalize(gpName);
    const normTaluk = taluk ? normalize(taluk) : "";

    // Score each member: higher = better match
    const scored = members
      .filter((m) => {
        // Skip members with no address at all (they match everything)
        const addr = (m.address_en ?? "").trim();
        return addr.length > 0;
      })
      .map((m) => {
        const normAddr = normalize(m.address_en ?? "");
        const normEmail = normalize((m.email_id ?? "").split("@")[0] ?? "");
        let score = 0;

        // +10 if address contains GP name
        if (normAddr.includes(normGp)) score += 10;
        // +10 if email prefix contains GP name
        if (normEmail.includes(normGp)) score += 10;
        // +5 if address contains taluk name
        if (normTaluk && normAddr.includes(normTaluk)) score += 5;
        // +3 per village name found in address
        for (const v of villageSet) {
          if (normAddr.includes(v)) score += 3;
        }
        // +2 for President/Adhaykasha designation
        if (
          m.designation?.toLowerCase().includes("adhaykasha") ||
          m.designation?.toLowerCase().includes("president") ||
          m.designation_kn?.includes("ಅಧ್ಯಕ್ಷ")
        ) {
          score += 2;
        }

        return { member: m, score };
      })
      .filter((s) => s.score >= 10) // require at least GP name in address or email
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.member ?? null;
    const memberName = best?.emp_name_en?.trim() ?? null;

    return NextResponse.json({
      memberName,
      allMembers: scored.map((s) => ({
        name: s.member.emp_name_en?.trim(),
        designation: s.member.designation,
        score: s.score,
      })),
    });
  } catch (error: any) {
    console.error("Failed to fetch GP members:", error?.message ?? error);
    return NextResponse.json(
      { error: "Failed to fetch GP member data", detail: error?.message },
      { status: 500 },
    );
  }
}
