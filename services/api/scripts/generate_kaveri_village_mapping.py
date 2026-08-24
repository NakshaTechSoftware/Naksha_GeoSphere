"""Generates the KGIS -> Kaveri village code mapping for every Karnataka
village, populating `kaveri_village_mapping` so the Explore page's
guideline-value popup (`app/api/v1/pricing.py`) can resolve automatically.

UNVERIFIED AGAINST LIVE SERVICES. This script needs network access to two
external hosts this sandbox cannot reach: the KGIS source MinIO
(`Settings.kgis_source_minio_endpoint`) and the live Kaveri portal
(`app.modules.pricing.kaveri_client.BASE_URL`). It has been exercised here
only against injected fixture data (see `tests/test_village_matching.py` for
the matching algorithm itself, which is fully covered without any network
dependency). Run a real pass in an environment with both connections,
starting with `--district` on one district before committing to the full
state.

Pipeline, following the task spec exactly:
    KGIS village (from MinIO) -> match District/Taluk/Hobli/Village names
    against the Kaveri hierarchy (cached locally after one fetch) ->
    confirmed/pending_review/failed -> upsert kaveri_village_mapping ->
    record progress (resume support) -> mapping_report.csv

Usage:
    docker compose exec api python scripts/generate_kaveri_village_mapping.py
    docker compose exec api python scripts/generate_kaveri_village_mapping.py --district "Dakshina Kannada"
    docker compose exec api python scripts/generate_kaveri_village_mapping.py --reset
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import sys
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.config import Settings, get_settings  # noqa: E402
from app.database.session import get_session_factory  # noqa: E402
from app.modules.pricing.kaveri_client import KaveriSession  # noqa: E402
from app.modules.pricing.kgis_source_client import KgisSourceClient, KgisVillage  # noqa: E402
from app.modules.pricing.kaveri_location_resolver import (  # noqa: E402
    CODE_KEYS_DISTRICT,
    CODE_KEYS_HOBLI,
    CODE_KEYS_TALUK,
    CODE_KEYS_VILLAGE,
    NAME_KEYS_VILLAGE,
    extract_value,
    resolve_in_hierarchy,
    status_for_score,
)
from app.modules.pricing.models import MappingStatus  # noqa: E402
from app.modules.pricing.repository import KaveriPricingRepository  # noqa: E402

logger = logging.getLogger("generate_kaveri_village_mapping")

HIERARCHY_CACHE_PATH = Path(__file__).parent / ".kaveri_hierarchy_cache.json"
# Written under scripts/ (not further up) because only this directory is
# actually bind-mounted from the host in compose.dev.yaml - anything written
# outside a mounted path only exists inside the ephemeral container.
CSV_REPORT_PATH = Path(__file__).parent / "mapping_report.csv"
BATCH_SIZE = 200

# All Kaveri key lookups are case-insensitive via `extract_value`, which
# handles the camelCase variants Kaveri actually returns
# (districtCode/talukNamee/hoblicode/villagecode/...) regardless of casing.


@dataclass(frozen=True, slots=True)
class KaveriHierarchy:
    """The whole Kaveri District->Taluk->Hobli->Village tree, fetched once
    and cached to disk - every later step is pure in-memory matching."""

    districts: list[dict]
    taluks_by_district_code: dict[str, list[dict]]
    hoblis_by_taluk_code: dict[str, list[dict]]
    villages_by_hobli_code: dict[str, list[dict]]


async def build_kaveri_hierarchy(kaveri: KaveriSession, *, use_cache: bool = True) -> KaveriHierarchy:
    if use_cache and HIERARCHY_CACHE_PATH.exists():
        logger.info("Loading cached Kaveri hierarchy from %s", HIERARCHY_CACHE_PATH)
        raw = json.loads(HIERARCHY_CACHE_PATH.read_text(encoding="utf-8"))
        return KaveriHierarchy(**raw)

    logger.info("Fetching Kaveri hierarchy from scratch (this is the only time it's fetched)...")
    districts = await kaveri.get_districts()
    taluks_by_district: dict[str, list[dict]] = {}
    hoblis_by_taluk: dict[str, list[dict]] = {}
    villages_by_hobli: dict[str, list[dict]] = {}

    for district in districts:
        district_code = extract_value(district, CODE_KEYS_DISTRICT)
        taluks = await kaveri.get_taluks(district_code)
        taluks_by_district[district_code] = taluks
        for taluk in taluks:
            taluk_code = extract_value(taluk, CODE_KEYS_TALUK)
            hoblis = await kaveri.get_hoblis(taluk_code)
            hoblis_by_taluk[taluk_code] = hoblis
            for hobli in hoblis:
                hobli_code = extract_value(hobli, CODE_KEYS_HOBLI)
                villages = await kaveri.get_villages(hobli_code)
                villages_by_hobli[hobli_code] = villages
        logger.info("Fetched Kaveri hierarchy for district %s", district_code)

    hierarchy = KaveriHierarchy(
        districts=districts,
        taluks_by_district_code=taluks_by_district,
        hoblis_by_taluk_code=hoblis_by_taluk,
        villages_by_hobli_code=villages_by_hobli,
    )
    HIERARCHY_CACHE_PATH.write_text(
        json.dumps(
            {
                "districts": hierarchy.districts,
                "taluks_by_district_code": hierarchy.taluks_by_district_code,
                "hoblis_by_taluk_code": hierarchy.hoblis_by_taluk_code,
                "villages_by_hobli_code": hierarchy.villages_by_hobli_code,
            }
        ),
        encoding="utf-8",
    )
    logger.info("Cached Kaveri hierarchy to %s", HIERARCHY_CACHE_PATH)
    return hierarchy


@dataclass(frozen=True, slots=True)
class VillageResult:
    """One CSV row / progress record - the outcome of matching a single
    KGIS village, independent of how it was sourced (real MinIO walk or a
    test fixture), so this stays unit-testable without I/O."""

    kgis: KgisVillage
    kaveri_village: dict | None
    score: float
    status: MappingStatus
    kaveri_district_code: str
    kaveri_taluk_code: str
    kaveri_hobli_code: str


def resolve_village(
    kgis_village: KgisVillage,
    hierarchy: KaveriHierarchy,
) -> VillageResult:
    """Pure matching step for one village. Delegates the whole District →
    Taluk → Hobli → Village chain to the shared resolver, which matches each
    level by name (and the district by its Bhoomi code derived from the KGIS
    village code), then reports the weakest link's score as confidence."""
    resolution = resolve_in_hierarchy(
        hierarchy,
        kgis_village.district,
        kgis_village.taluk,
        kgis_village.hobli,
        kgis_village.village_name,
        kgis_village.kgis_village_code,
    )

    status = MappingStatus(status_for_score(resolution.confidence))
    kaveri_village = resolution.village_candidate if status != MappingStatus.FAILED else None

    return VillageResult(
        kgis=kgis_village,
        kaveri_village=kaveri_village,
        score=resolution.confidence,
        status=status,
        kaveri_district_code=resolution.kaveri_district_code,
        kaveri_taluk_code=resolution.kaveri_taluk_code,
        kaveri_hobli_code=resolution.kaveri_hobli_code,
    )


async def process_district(
    kgis: KgisSourceClient,
    s3,
    hierarchy: KaveriHierarchy,
    district_folder,
    processed: set[str],
) -> list[VillageResult]:
    results: list[VillageResult] = []
    taluk_folders = await kgis.list_taluks(s3, district_folder.prefix)
    for taluk_folder in taluk_folders:
        hobli_folders = await kgis.list_hoblis(s3, taluk_folder.prefix)
        for hobli_folder in hobli_folders:
            villages = await kgis.get_hobli_villages(
                s3,
                hobli_folder.prefix,
                district=district_folder.display_name,
                taluk=taluk_folder.display_name,
                hobli=hobli_folder.display_name,
            )
            for village in villages:
                if village.kgis_village_code in processed:
                    continue
                results.append(resolve_village(village, hierarchy))
        logger.info("Processed taluk %s (%d villages so far)", taluk_folder.display_name, len(results))

    return results


async def write_csv_report(results: list[VillageResult], *, append: bool) -> None:
    write_header = not append or not CSV_REPORT_PATH.exists()
    mode = "a" if append else "w"
    with CSV_REPORT_PATH.open(mode, newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(
                [
                    "KGIS Village Code",
                    "KGIS Village Name",
                    "District",
                    "Taluk",
                    "Hobli",
                    "Kaveri Village Code",
                    "Kaveri Village Name",
                    "Match Score",
                    "Status",
                ]
            )
        for result in results:
            kaveri_code = extract_value(result.kaveri_village, CODE_KEYS_VILLAGE) if result.kaveri_village else ""
            kaveri_name = extract_value(result.kaveri_village, NAME_KEYS_VILLAGE) if result.kaveri_village else ""
            writer.writerow(
                [
                    result.kgis.kgis_village_code,
                    result.kgis.village_name,
                    result.kgis.district,
                    result.kgis.taluk,
                    result.kgis.hobli,
                    kaveri_code,
                    kaveri_name,
                    f"{result.score:.2f}",
                    result.status.value,
                ]
            )


async def persist_results(repo: KaveriPricingRepository, results: list[VillageResult]) -> None:
    for result in results:
        if result.status != MappingStatus.FAILED and result.kaveri_village is not None:
            await repo.upsert_village_mapping(
                kgis_village_code=result.kgis.kgis_village_code,
                village_name=result.kgis.village_name,
                district=result.kgis.district,
                taluk=result.kgis.taluk,
                hobli=result.kgis.hobli,
                kaveri_district_code=result.kaveri_district_code,
                kaveri_taluk_code=result.kaveri_taluk_code,
                kaveri_hobli_code=result.kaveri_hobli_code,
                kaveri_village_code=extract_value(result.kaveri_village, CODE_KEYS_VILLAGE),
                mapping_status=result.status,
                matching_score=Decimal(str(round(result.score, 2))),
            )
        await repo.mark_progress(result.kgis.kgis_village_code, result.status)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--district", help="Limit to one KGIS district display name (pilot run).")
    parser.add_argument("--reset", action="store_true", help="Clear generation progress before running.")
    parser.add_argument(
        "--reset-mappings", action="store_true", help="Also clear kaveri_village_mapping (implies --reset)."
    )
    parser.add_argument(
        "--refresh-kaveri-cache",
        action="store_true",
        help="Re-fetch the Kaveri hierarchy instead of using the local cache file.",
    )
    parser.add_argument("--state", default="karnataka", help="MinIO state folder name (lowercase).")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    settings: Settings = get_settings()
    session_factory = get_session_factory()

    async with session_factory() as session:
        repo = KaveriPricingRepository(session)
        if args.reset_mappings:
            await repo.clear_mappings()
            await repo.clear_progress()
            await session.commit()
        elif args.reset:
            await repo.clear_progress()
            await session.commit()

        processed = await repo.get_processed_kgis_codes()
        logger.info("%d villages already processed - will be skipped.", len(processed))

        async with KaveriSession() as kaveri:
            hierarchy = await build_kaveri_hierarchy(kaveri, use_cache=not args.refresh_kaveri_cache)

        kgis = KgisSourceClient(settings)
        all_results: list[VillageResult] = []
        wrote_csv = False

        async with kgis.client() as s3:
            districts = await kgis.list_districts(s3, args.state)
            if args.district:
                target = args.district.strip().lower()
                districts = [d for d in districts if d.display_name == target or target in d.display_name]

            for district_folder in districts:
                logger.info("Processing district: %s", district_folder.display_name)
                results = await process_district(kgis, s3, hierarchy, district_folder, processed)
                all_results.extend(results)
                processed.update(r.kgis.kgis_village_code for r in results)

                for i in range(0, len(results), BATCH_SIZE):
                    batch = results[i : i + BATCH_SIZE]
                    await persist_results(repo, batch)
                    await session.commit()

                await write_csv_report(results, append=wrote_csv)
                wrote_csv = True

        confirmed = sum(1 for r in all_results if r.status == MappingStatus.CONFIRMED)
        pending = sum(1 for r in all_results if r.status == MappingStatus.PENDING_REVIEW)
        failed = sum(1 for r in all_results if r.status == MappingStatus.FAILED)
        logger.info(
            "Done. %d confirmed, %d pending_review, %d failed. Report: %s",
            confirmed,
            pending,
            failed,
            CSV_REPORT_PATH,
        )


if __name__ == "__main__":
    asyncio.run(main())
