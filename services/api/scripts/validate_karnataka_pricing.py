"""Karnataka-wide sample validation for the Kaveri guideline-value pipeline
(task spec Part 14/15).

Scope of what this actually validates: it drives the SAME functions the live
`/api/v1/pricing/guideline-value` endpoint uses — `select_road`,
`resolve_land_classification`, `_fetch_rate_entries`, `land_unit.
guideline_value` — against the real `kaveri.karnataka.gov.in` portal, sampling
villages directly from Kaveri's own District->Taluk->Hobli->Village hierarchy
across the districts named in the task spec.

What it does NOT validate: the KGIS-name -> Kaveri-name fuzzy matching layer
(`kaveri_location_resolver.resolve_kaveri_location` /
`village_matching.match_village`), because that requires a real KGIS parcel
name to resolve against and this sandbox has no network path to the KGIS
source MinIO (`Settings.kgis_source_minio_endpoint`) — the same limitation
`generate_kaveri_village_mapping.py` documents. That layer has its own live-
data-derived unit tests instead (see `tests/test_kaveri_location_resolver.py`,
built from villages actually observed live during this validation).

Usage:
    py scripts/validate_karnataka_pricing.py
    py scripts/validate_karnataka_pricing.py --villages-per-district 5
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.modules.pricing.classification import resolve_land_classification  # noqa: E402
from app.modules.pricing.kaveri_client import KaveriSession  # noqa: E402
from app.modules.pricing.kaveri_location_resolver import extract_value, select_road  # noqa: E402
from app.modules.pricing import land_unit  # noqa: E402

CSV_REPORT_PATH = Path(__file__).parent / "karnataka_validation_report.csv"

# Districts named explicitly in the task spec. Matched against Kaveri's own
# `districtNamee` values by substring (Kaveri's own naming, e.g. "Bangalore
# Rural" for "Bengaluru Rural equivalent") — not a hardcoded code, just a
# display-name filter for which of the 36 live districts to sample.
TARGET_DISTRICTS = (
    "Mangalore",  # Kaveri's own name for the Dakshina Kannada district
    "Bangalore Rural", "Bangalore", "Mysore", "Kodagu",
    "Raichur", "Belgaum", "Bellary", "Tumkur", "Udupi", "Shimoga",
)


@dataclass
class SampleResult:
    district: str
    taluk: str
    hobli: str
    village: str
    kaveri_village_code: str
    classification: str
    road_code: str | None
    road_name: str | None
    road_confidence: float
    road_method: str
    rate_type: str | None
    rate: str | None
    rate_unit: str | None
    plot_area_sqm: float
    calculated_value: str | None
    final_status: str


async def _fetch_rate_entries(kaveri: KaveriSession, road_code: str, classification) -> list[dict]:
    # Mirrors app.api.v1.pricing._fetch_rate_entries without importing FastAPI
    # route internals into a standalone script.
    entries: list[dict] = []
    if classification.classification in ("agricultural", "unknown"):
        for e in await kaveri.get_agricultural_rate(road_code):
            rate = e.get("rate")
            if not rate:
                continue
            entries.append(
                {"label": e.get("propertytype", "Agricultural"), "rate": rate, "rate_unit": land_unit.AGRICULTURAL_RATE_UNIT}
            )
    if classification.classification in ("non_agricultural", "unknown"):
        for e in await kaveri.get_vacant_rate(road_code):
            rate = e.get("rate")
            if not rate:
                continue
            entries.append(
                {"label": e.get("propertytypename", "Vacant"), "rate": rate, "rate_unit": land_unit.NON_AGRICULTURAL_RATE_UNIT}
            )
    return entries


async def sample_village(
    kaveri: KaveriSession, district: dict, taluk: dict, hobli: dict, village: dict
) -> SampleResult:
    district_name = extract_value(district, ("districtNamee",))
    taluk_name = extract_value(taluk, ("talukNamee",))
    hobli_name = extract_value(hobli, ("hoblinamee",))
    village_name = extract_value(village, ("villagenamee",))
    village_code = extract_value(village, ("villagecode",))
    plot_area_sqm = 200.0

    roads = await kaveri.get_roads(village_code)
    if not roads:
        return SampleResult(
            district_name, taluk_name, hobli_name, village_name, village_code,
            "unknown", None, None, 0.0, "manual_required", None, None, None,
            plot_area_sqm, None, "no_roads_found",
        )

    road_res = select_road(roads, village_name, None)
    classification = resolve_land_classification()  # no GIS/Bhoomi evidence in this sample -> unknown
    entries = await _fetch_rate_entries(kaveri, road_res.road_code, classification)

    if not entries:
        return SampleResult(
            district_name, taluk_name, hobli_name, village_name, village_code,
            classification.classification, road_res.road_code, road_res.road_name,
            road_res.confidence, road_res.method, None, None, None,
            plot_area_sqm, None, "no_rate_on_resolved_road",
        )

    distinct_labels = {e["label"] for e in entries}
    if len(distinct_labels) > 1:
        return SampleResult(
            district_name, taluk_name, hobli_name, village_name, village_code,
            "ambiguous", road_res.road_code, road_res.road_name,
            road_res.confidence, road_res.method, None, None, None,
            plot_area_sqm, None, "classification_unknown_multiple_rates",
        )

    selected = entries[0]
    from decimal import Decimal
    value = land_unit.guideline_value(Decimal(str(plot_area_sqm)), Decimal(str(selected["rate"])), selected["rate_unit"])
    return SampleResult(
        district_name, taluk_name, hobli_name, village_name, village_code,
        classification.classification, road_res.road_code, road_res.road_name,
        road_res.confidence, road_res.method, selected["label"], str(selected["rate"]),
        selected["rate_unit"], plot_area_sqm, f"{value:.2f}", "ok",
    )


async def main(villages_per_district: int) -> None:
    results: list[SampleResult] = []
    async with KaveriSession() as kaveri:
        districts = await kaveri.get_districts()
        targets = [
            d for d in districts
            if any(t.lower() in extract_value(d, ("districtNamee",)).lower() for t in TARGET_DISTRICTS)
        ]
        print(f"Matched {len(targets)} of {len(TARGET_DISTRICTS)} target districts against {len(districts)} live Kaveri districts")

        for district in targets:
            dcode = extract_value(district, ("districtCode",))
            taluks = await kaveri.get_taluks(dcode)
            sampled = 0
            for taluk in taluks:
                if sampled >= villages_per_district:
                    break
                tcode = extract_value(taluk, ("talukCode",))
                hoblis = await kaveri.get_hoblis(tcode)
                for hobli in hoblis:
                    if sampled >= villages_per_district:
                        break
                    hcode = extract_value(hobli, ("hoblicode",))
                    villages = await kaveri.get_villages(hcode)
                    for village in villages:
                        if sampled >= villages_per_district:
                            break
                        try:
                            result = await sample_village(kaveri, district, taluk, hobli, village)
                        except Exception as exc:  # noqa: BLE001
                            result = SampleResult(
                                extract_value(district, ("districtNamee",)), extract_value(taluk, ("talukNamee",)),
                                extract_value(hobli, ("hoblinamee",)), extract_value(village, ("villagenamee",)),
                                extract_value(village, ("villagecode",)), "unknown", None, None, 0.0,
                                "manual_required", None, None, None, 200.0, None, f"api_failure:{exc}",
                            )
                        results.append(result)
                        sampled += 1
                        print(f"  {result.district} / {result.village} -> {result.final_status}")

    with CSV_REPORT_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "district", "taluk", "hobli", "village", "kaveri_village_code", "classification",
            "road_code", "road_name", "road_confidence", "road_method", "rate_type", "rate",
            "rate_unit", "plot_area_sqm", "calculated_value", "final_status",
        ])
        for r in results:
            writer.writerow([
                r.district, r.taluk, r.hobli, r.village, r.kaveri_village_code, r.classification,
                r.road_code, r.road_name, f"{r.road_confidence:.2f}", r.road_method, r.rate_type,
                r.rate, r.rate_unit, r.plot_area_sqm, r.calculated_value, r.final_status,
            ])

    total = len(results)
    ok = sum(1 for r in results if r.final_status == "ok")
    ambiguous = sum(1 for r in results if r.final_status == "classification_unknown_multiple_rates")
    no_rate = sum(1 for r in results if r.final_status == "no_rate_on_resolved_road")
    no_roads = sum(1 for r in results if r.final_status == "no_roads_found")
    api_failures = sum(1 for r in results if r.final_status.startswith("api_failure"))
    high_conf_road = sum(1 for r in results if r.road_confidence >= 0.8)

    print("\n--- Karnataka sample validation summary ---")
    print(f"Total villages sampled: {total}")
    print(f"Rate resolved (ok): {ok} ({ok / total * 100:.1f}%)" if total else "Rate resolved: 0")
    print(f"Ambiguous (classification_unknown, multiple rate types): {ambiguous}")
    print(f"No rate on resolved road/village: {no_rate}")
    print(f"No roads found: {no_roads}")
    print(f"API failures: {api_failures}")
    print(f"High-confidence road resolution (>=0.8): {high_conf_road} ({high_conf_road / total * 100:.1f}%)" if total else "")
    print(f"\nFull report written to {CSV_REPORT_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--villages-per-district", type=int, default=3)
    args = parser.parse_args()
    asyncio.run(main(args.villages_per_district))
