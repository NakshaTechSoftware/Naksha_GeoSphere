"""API endpoint for the Kaveri government guideline value ("SR Rate") shown
in the Explore page's cadastral parcel popup.

Orchestration for a click on a parcel:
KGIS village code (+ the parcel's KGIS district/taluk/hobli/village names) ->
kaveri_village_mapping lookup -> on a miss, the live Kaveri resolver is
invoked and the result is persisted (auto-resolve) -> land classification
resolved from Bhoomi/RTC then GIS attributes (never a hardcoded default) ->
live Kaveri Road lookup -> road resolved with an explicit confidence + method
(never `roads[0]`) -> the correct rate endpoint (agricultural vs
non-agricultural) queried only for the classification actually resolved ->
DB rate cache check keyed on (village, road, property_type) -> Site Value
calculation with unit-aware rate conversion.

Every step is logged at INFO (see the task's debug spec) and every failure
mode maps to a granular `GuidelineValueUnavailableReason` (district_match_failed,
road_not_found, agricultural_rate_not_found, classification_unknown, ...) so a
failing parcel click can be pinpointed to the exact step — never a bare
"unavailable". When the resolver genuinely cannot pick one road or one
property type with confidence, the endpoint returns `road_selection_required`
/ `classification_unknown` with every candidate rate found, rather than
silently guessing one (see `app.modules.pricing.kaveri_location_resolver`'s
`select_road` and `app.modules.pricing.classification`).
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_session
from app.modules.pricing import land_unit
from app.modules.pricing.agricultural_category import (
    KaveriCategoryOption,
    normalize_kaveri_label,
    resolve_agricultural_category,
)
from app.modules.pricing.classification import LandClassification, resolve_land_classification
from app.modules.pricing.exceptions import KaveriUnavailableError
from app.modules.pricing.kaveri_client import KaveriSession
from app.modules.pricing.kaveri_location_resolver import (
    AUTO_CONFIRM_THRESHOLD,
    PENDING_REVIEW_THRESHOLD,
    RoadCandidate,
    extract_value,
    find_sibling_villages,
    resolve_kaveri_location,
    resolve_kaveri_location_debug,
    select_road,
)
from app.modules.pricing.models import MappingStatus
from app.modules.pricing.repository import KaveriPricingRepository
from app.modules.pricing.schemas import (
    GuidelineValueClassificationRequiredResponse,
    GuidelineValueRateCategorySelectionRequiredResponse,
    GuidelineValueResponse,
    GuidelineValueRoadSelectionRequiredResponse,
    GuidelineValueUnavailableReason,
    GuidelineValueUnavailableResponse,
    PropertyTypeCandidate,
    RatedRoadCandidate,
)

logger = logging.getLogger("pricing")

router = APIRouter(prefix="/pricing", tags=["pricing"])

ResponseUnion = (
    GuidelineValueResponse
    | GuidelineValueUnavailableResponse
    | GuidelineValueRoadSelectionRequiredResponse
    | GuidelineValueClassificationRequiredResponse
    | GuidelineValueRateCategorySelectionRequiredResponse
)

# Bounded so a village with hundreds of roads (real example: Beltangadi Town,
# 268 roads) doesn't turn one parcel click into hundreds of live Kaveri calls.
# The candidates checked are the top-N by relevance (see `select_road`'s
# `ranked` ordering), which is where the correct road almost always sits when
# it isn't an exact attribute match.
MAX_ROAD_CANDIDATES_TO_CHECK = 6

# Bounds for the same-hobli sibling-village fallback (spec Part 10) — only
# engaged after the primary village's own roads are proven empty, and even
# then capped so a village with many "Town"/"City" siblings can't turn one
# parcel click into an unbounded number of live Kaveri calls.
MAX_SIBLING_VILLAGES_TO_CHECK = 5
MAX_ROADS_PER_SIBLING = 3

# Hard ceiling on the whole request, regardless of how many live Kaveri calls
# the resolution needs (hierarchy resolution, hobli fan-out, road fallback
# scan, sibling-village fallback, rate lookups). No individual Kaveri call can
# exceed KaveriSession's own per-request timeout (15s read), but a pathological
# combination of many sequential calls against a degraded Kaveri portal could
# otherwise still leave a request pending far longer than any UI should wait —
# this bounds the total absolutely. On expiry the endpoint returns a distinct
# `kaveri_timeout` reason rather than hanging indefinitely (spec Part G).
OVERALL_REQUEST_TIMEOUT_SECONDS = 25.0


def _unavailable(
    reason: GuidelineValueUnavailableReason,
    message: str,
    debug_detail: str | None = None,
) -> GuidelineValueUnavailableResponse:
    return GuidelineValueUnavailableResponse(reason=reason, message=message, debug_detail=debug_detail)


# --- Non-agricultural property-type labeling --------------------------------
# Only used to (a) label a resolved rate for display and (b) match a known
# `classification.subtype` against Kaveri's own `propertytypename` values.
# Never used to rank/pick between multiple types when the subtype is unknown
# — that ambiguity is surfaced via `classification_unknown` instead.
_NON_AGRI_SUBTYPE_LABEL = {
    "residential": "Residential",
    "commercial": "Commercial",
    "industrial": "Industrial",
    "vacant_open": "Vacant/Open Land",
    "other": "Other",
}


def _classify_non_agri_subtype(name: str) -> str:
    n = (name or "").lower()
    if "residential" in n or "residence" in n or "house" in n:
        return "residential"
    if "commercial" in n:
        return "commercial"
    if "industrial" in n:
        return "industrial"
    if any(k in n for k in ("vacant", "open land", "open", "site", "plot", "layout")):
        return "vacant_open"
    return "other"


def _extract_rate(entry: dict) -> Decimal | None:
    for key in (
        "rate", "guidelinevalue", "guideline_value", "value", "standardrate", "standard_rate"
    ):
        if key in entry and entry[key] not in (None, ""):
            try:
                val = Decimal(str(entry[key]))
            except (InvalidOperation, ValueError):
                continue
            if val > 0:
                return val
    return None


def _extract_type_name(entry: dict) -> str:
    # "propertytype" is the real key SearchAgriculturalPropertyType uses
    # (verified live 2026-08-24, e.g. "Bagayat, Dry" / "Plantation, Rubber/Areca nut");
    # "propertytypename" is SearchVacantTypeRateDetails's key.
    for key in ("propertytype", "propertytypename", "agriculturaltypename", "typename", "name", "type"):
        if key in entry and entry[key]:
            return str(entry[key]).strip()
    return ""


async def _fetch_rate_entries(
    kaveri: KaveriSession,
    road_code: str,
    classification: LandClassification,
) -> list[dict]:
    """Every candidate rate Kaveri has for this road, filtered to the
    classification actually resolved (never both endpoints treated as
    interchangeable options to rank against each other)."""
    entries: list[dict] = []

    if classification.classification in ("agricultural", "unknown"):
        try:
            agri = await kaveri.get_agricultural_rate(road_code)
        except Exception:  # noqa: BLE001
            logger.exception("AGRICULTURAL RATE lookup failed for road %s", road_code)
            agri = []
        for e in agri:
            rate = _extract_rate(e)
            if rate is None:
                continue
            entries.append(
                {
                    "label": _extract_type_name(e) or "Agricultural",
                    "rate": rate,
                    "rate_unit": land_unit.AGRICULTURAL_RATE_UNIT,
                    "source": "agricultural",
                    "subtype": None,
                }
            )

    if classification.classification in ("non_agricultural", "unknown"):
        try:
            vacant = await kaveri.get_vacant_rate(road_code)
        except Exception:  # noqa: BLE001
            logger.exception("VACANT RATE lookup failed for road %s", road_code)
            vacant = []
        for e in vacant:
            rate = _extract_rate(e)
            if rate is None:
                continue
            tname = _extract_type_name(e)
            subtype = _classify_non_agri_subtype(tname)
            if classification.classification == "non_agricultural" and classification.subtype:
                if subtype != classification.subtype:
                    continue
            entries.append(
                {
                    "label": tname or _NON_AGRI_SUBTYPE_LABEL.get(subtype, "Other"),
                    "rate": rate,
                    "rate_unit": land_unit.NON_AGRICULTURAL_RATE_UNIT,
                    "source": "vacant",
                    "subtype": subtype,
                }
            )

    return entries


async def _fetch_rate_entries_cached(
    repo: KaveriPricingRepository,
    kaveri: KaveriSession,
    kaveri_village_code: str,
    road_code: str,
    classification: LandClassification,
    *,
    road_confidence: float,
    road_resolution_method: str,
) -> list[dict]:
    """Same contract as `_fetch_rate_entries`, but consults the DB cache
    first and, on a live fetch, caches EVERY entry found for the road (not
    just whatever one parcel goes on to select) so the next parcel resolved
    to the same (village, road) skips the live Kaveri calls entirely (spec
    Part 14) — while still resolving its own category independently every
    time (spec Part 11).

    Cache reuse only applies once classification is concretely agricultural
    or non-agricultural — an "unknown" classification must still probe both
    endpoints live, since a partial cache (built from some earlier request
    that only asked about one of the two) could otherwise under-report the
    candidates actually available."""
    if classification.classification in ("agricultural", "non_agricultural"):
        try:
            cached_rows = await repo.get_fresh_rate_entries_for_road(kaveri_village_code, road_code)
        except SQLAlchemyError:
            # Caching is an optimization, never a correctness requirement —
            # a broken cache READ must degrade to "treat as a miss and hit
            # Kaveri live", not abort the whole rate lookup (spec Part 3/14
            # generalized beyond just per-road Kaveri failures).
            logger.exception(
                "RATE CACHE read failed for village=%s road=%s — falling back to live fetch",
                kaveri_village_code, road_code,
            )
            await repo.rollback()
            cached_rows = None
        if cached_rows is not None:
            unit = (
                land_unit.AGRICULTURAL_RATE_UNIT
                if classification.classification == "agricultural"
                else land_unit.NON_AGRICULTURAL_RATE_UNIT
            )
            rows = [r for r in cached_rows if r.rate_unit == unit]
            if rows:
                entries = [
                    {
                        "label": r.property_type,
                        "rate": r.standard_rate,
                        "rate_unit": r.rate_unit,
                        "subtype": _classify_non_agri_subtype(r.property_type) if unit == land_unit.NON_AGRICULTURAL_RATE_UNIT else None,
                    }
                    for r in rows
                ]
                if classification.classification == "non_agricultural" and classification.subtype:
                    entries = [e for e in entries if e["subtype"] == classification.subtype]
                logger.info(
                    "RATE CACHE hit: village=%s road=%s classification=%s -> %d cached entries",
                    kaveri_village_code, road_code, classification.classification, len(entries),
                )
                return entries

    entries = await _fetch_rate_entries(kaveri, road_code, classification)
    if entries:
        try:
            await repo.upsert_rate_cache_bulk(
                kaveri_village_code,
                road_code,
                entries,
                road_confidence=Decimal(str(round(road_confidence, 3))),
                road_resolution_method=road_resolution_method,
                classification=classification.classification,
            )
        except SQLAlchemyError:
            # A real production incident (Kodagu district): a Kaveri
            # category label exceeded the cache column's old width and
            # threw `StringDataRightTruncationError`, which the endpoint's
            # top-level handler then flattened into a generic
            # `kaveri_api_error` — hiding a real Kaveri rate behind a false
            # "upstream failure". The rates Kaveri actually returned are
            # already in `entries` and must still be usable even when
            # persisting them to the cache fails.
            logger.exception(
                "RATE CACHE write failed for village=%s road=%s — continuing without caching "
                "(the live entries themselves are still returned)",
                kaveri_village_code, road_code,
            )
            await repo.rollback()
    return entries


@router.get("/guideline-value", response_model=ResponseUnion)
async def get_guideline_value(
    kgis_village_code: str = Query(..., description="KGIS village code from the clicked parcel."),
    plot_area_sqm: float = Query(..., gt=0, description="Parcel area in square meters."),
    district: str | None = Query(None, description="KGIS district name."),
    taluk: str | None = Query(None, description="KGIS taluk name."),
    hobli: str | None = Query(None, description="KGIS hobli name."),
    village: str | None = Query(None, description="KGIS village name."),
    road: str | None = Query(None, description="Optional cadastral road/locality attribute."),
    category: str | None = Query(
        None, description="Parcel land Category GIS attribute (classification evidence)."
    ),
    landcode: str | None = Query(
        None, description="Parcel Landcode GIS attribute (classification evidence)."
    ),
    bhoomi_land_classification: str | None = Query(
        None,
        description=(
            "Bhoomi/RTC land classification (e.g. Agriculture/Residential/Commercial), "
            "when already fetched for this parcel. Highest-priority classification evidence."
        ),
    ),
    bhoomi_crop: str | None = Query(
        None,
        description=(
            "Comma-separated RTC crop names for this parcel, when available — used only to "
            "disambiguate WHICH agricultural Kaveri category applies once classification is "
            "already known to be agricultural (e.g. Bagayat Coconut vs Bagayat Dry)."
        ),
    ),
    bhoomi_irrigation: str | None = Query(
        None, description="RTC irrigation source for this parcel, when available (same use as bhoomi_crop)."
    ),
    lgd_village_code: str | None = Query(
        None,
        description=(
            "LGD village code for this parcel, when known. Stored as a corroborating "
            "crosswalk identifier alongside the resolved Kaveri codes (spec Part 7/8) — "
            "never used to fabricate a Kaveri code, only as audit/provenance evidence."
        ),
    ),
    bhucode: str | None = Query(
        None,
        description=(
            "Bhoomi/Bhucode for this parcel, when known. Stored as a corroborating "
            "crosswalk identifier (spec Part 7/8)."
        ),
    ),
    session: AsyncSession = Depends(get_session),
) -> ResponseUnion:
    """Thin public entry point: enforces an absolute ceiling on the whole
    request (spec Part G) so a pathological combination of live Kaveri calls
    (hierarchy resolution, hobli fan-out, road fallback scan, sibling-village
    fallback, rate lookups) can never leave the frontend's "Loading guideline
    value…" spinner running indefinitely — every path through `_resolve_guideline_value`
    settles well within this, or the request is cut off here with an explicit
    `kaveri_timeout` reason."""
    try:
        return await asyncio.wait_for(
            _resolve_guideline_value(
                kgis_village_code=kgis_village_code,
                plot_area_sqm=plot_area_sqm,
                district=district,
                taluk=taluk,
                hobli=hobli,
                village=village,
                road=road,
                category=category,
                landcode=landcode,
        bhoomi_land_classification=bhoomi_land_classification,
        bhoomi_crop=bhoomi_crop,
        bhoomi_irrigation=bhoomi_irrigation,
        lgd_village_code=lgd_village_code,
        bhucode=bhucode,
        session=session,
    ),
            timeout=OVERALL_REQUEST_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "GUIDELINE-VALUE request exceeded %.0fs -> kaveri_timeout for kgis_village_code=%s",
            OVERALL_REQUEST_TIMEOUT_SECONDS, kgis_village_code,
        )
        return _unavailable(
            GuidelineValueUnavailableReason.KAVERI_TIMEOUT,
            "Kaveri temporarily unavailable — please retry",
            debug_detail=f"kaveri_timeout: exceeded {OVERALL_REQUEST_TIMEOUT_SECONDS:.0f}s total budget",
        )


async def _resolve_guideline_value(
    *,
    kgis_village_code: str,
    plot_area_sqm: float,
    district: str | None,
    taluk: str | None,
    hobli: str | None,
    village: str | None,
    road: str | None,
    category: str | None,
    landcode: str | None,
    bhoomi_land_classification: str | None,
    bhoomi_crop: str | None,
    bhoomi_irrigation: str | None,
    lgd_village_code: str | None,
    bhucode: str | None,
    session: AsyncSession,
) -> ResponseUnion:
    repo = KaveriPricingRepository(session)

    logger.info(
        "GUIDELINE-VALUE request | KGIS Village Code: %s | Village: %s | District: %s | "
        "Taluk: %s | Hobli: %s | Area: %s | Road: %s | Category: %s | Landcode: %s | "
        "BhoomiClassification: %s | BhoomiCrop: %s | BhoomiIrrigation: %s",
        kgis_village_code, village, district, taluk, hobli, plot_area_sqm, road,
        category, landcode, bhoomi_land_classification, bhoomi_crop, bhoomi_irrigation,
    )
    crops = [c.strip() for c in bhoomi_crop.split(",") if c.strip()] if bhoomi_crop else None

    try:
        area = Decimal(str(plot_area_sqm))
    except InvalidOperation:
        logger.exception("GUIDELINE-VALUE invalid plot area: %s", plot_area_sqm)
        return _unavailable(
            GuidelineValueUnavailableReason.INVALID_PLOT_AREA,
            "Kaveri service is temporarily unavailable.",
            debug_detail="invalid_plot_area: plot_area_sqm did not parse as a decimal",
        )

    # 1. Land classification — resolved once, up front, from the best
    # available evidence. Never defaults to Residential.
    classification = resolve_land_classification(
        bhoomi_land_classification=bhoomi_land_classification, category=category, landcode=landcode
    )
    logger.info(
        "CLASSIFICATION resolved: classification=%s subtype=%s confidence=%.2f source=%s",
        classification.classification, classification.subtype, classification.confidence, classification.source,
    )

    # 2. Mapping lookup ------------------------------------------------------
    mapping = await repo.get_mapping_by_kgis_code(kgis_village_code)
    village_name_for_road = village
    mapping_status_value = "confirmed"

    if mapping is None:
        logger.info("MAPPING lookup: NOT FOUND for kgis_village_code=%s", kgis_village_code)
        if not (district and taluk and hobli and village):
            logger.info("MAPPING missing and KGIS names incomplete -> mapping_missing")
            return _unavailable(
                GuidelineValueUnavailableReason.MAPPING_MISSING,
                "Government location mapping could not be resolved automatically.",
                debug_detail="mapping_missing: no usable mapping and parcel names incomplete",
            )
        try:
            async with KaveriSession() as kaveri:
                resolution = await resolve_kaveri_location(
                    kaveri, district, taluk, hobli, village, kgis_village_code
                )
            logger.info(
                "RESOLVER result: district=%s taluk=%s hobli=%s village=%s | "
                "scores d=%.1f t=%.1f h=%.1f v=%.1f conf=%.1f matched=%s",
                resolution.kaveri_district_code, resolution.kaveri_taluk_code,
                resolution.kaveri_hobli_code, resolution.kaveri_village_code,
                resolution.district_score, resolution.taluk_score, resolution.hobli_score,
                resolution.village_score, resolution.confidence, resolution.matched,
            )

            if not resolution.matched:
                if not resolution.kaveri_district_code:
                    reason = GuidelineValueUnavailableReason.DISTRICT_MATCH_FAILED
                elif not resolution.kaveri_taluk_code:
                    reason = GuidelineValueUnavailableReason.TALUK_MATCH_FAILED
                elif not resolution.kaveri_hobli_code:
                    reason = GuidelineValueUnavailableReason.HOBLI_MATCH_FAILED
                else:
                    reason = GuidelineValueUnavailableReason.VILLAGE_MATCH_FAILED
                detail = (
                    f"{reason.value}: district={resolution.district_score:.1f} "
                    f"taluk={resolution.taluk_score:.1f} hobli={resolution.hobli_score:.1f} "
                    f"village={resolution.village_score:.1f} method={resolution.method}"
                )
                logger.info("RESOLVER failed at level: %s", detail)
                await repo.upsert_village_mapping(
                    kgis_village_code=kgis_village_code,
                    village_name=village,
                    district=district,
                    taluk=taluk,
                    hobli=hobli,
                    kaveri_district_code=resolution.kaveri_district_code or "",
                    kaveri_taluk_code=resolution.kaveri_taluk_code or "",
                    kaveri_hobli_code=resolution.kaveri_hobli_code or "",
                    kaveri_village_code=resolution.kaveri_village_code or "",
                    mapping_status=MappingStatus.FAILED,
                    matching_score=Decimal(str(round(resolution.confidence, 2))),
                    lgd_village_code=lgd_village_code,
                    bhucode=bhucode,
                    mapping_method=resolution.method,
                    resolved_at=datetime.now(timezone.utc),
                )
                await repo.commit()
                return _unavailable(
                    reason,
                    "Government location mapping could not be resolved automatically.",
                    debug_detail=detail,
                )

            if resolution.confidence < PENDING_REVIEW_THRESHOLD:
                detail = (
                    f"mapping_missing: low confidence={resolution.confidence:.1f} "
                    f"(district={resolution.district_score:.1f} taluk={resolution.taluk_score:.1f} "
                    f"hobli={resolution.hobli_score:.1f} village={resolution.village_score:.1f} "
                    f"method={resolution.method})"
                )
                logger.info("RESOLVER low confidence -> FAILED mapping: %s", detail)
                await repo.upsert_village_mapping(
                    kgis_village_code=kgis_village_code,
                    village_name=village,
                    district=district,
                    taluk=taluk,
                    hobli=hobli,
                    kaveri_district_code=resolution.kaveri_district_code or "",
                    kaveri_taluk_code=resolution.kaveri_taluk_code or "",
                    kaveri_hobli_code=resolution.kaveri_hobli_code or "",
                    kaveri_village_code=resolution.kaveri_village_code or "",
                    mapping_status=MappingStatus.FAILED,
                    matching_score=Decimal(str(round(resolution.confidence, 2))),
                    lgd_village_code=lgd_village_code,
                    bhucode=bhucode,
                    mapping_method=resolution.method,
                    resolved_at=datetime.now(timezone.utc),
                )
                await repo.commit()
                return _unavailable(
                    GuidelineValueUnavailableReason.MAPPING_MISSING,
                    "Government location mapping could not be resolved automatically.",
                    debug_detail=detail,
                )

            status = (
                MappingStatus.CONFIRMED
                if resolution.confidence >= AUTO_CONFIRM_THRESHOLD
                else MappingStatus.PENDING_REVIEW
            )
            logger.info("RESOLVER success -> persisting mapping (status=%s)", status.value)
            await repo.upsert_village_mapping(
                kgis_village_code=kgis_village_code,
                village_name=village,
                district=district,
                taluk=taluk,
                hobli=hobli,
                kaveri_district_code=resolution.kaveri_district_code or "",
                kaveri_taluk_code=resolution.kaveri_taluk_code or "",
                kaveri_hobli_code=resolution.kaveri_hobli_code or "",
                kaveri_village_code=resolution.kaveri_village_code or "",
                mapping_status=status,
                matching_score=Decimal(str(round(resolution.confidence, 2))),
                lgd_village_code=lgd_village_code,
                bhucode=bhucode,
                mapping_method=resolution.method,
                resolved_at=datetime.now(timezone.utc),
            )
            await repo.commit()
            kaveri_village_code = resolution.kaveri_village_code
            kaveri_hobli_code = resolution.kaveri_hobli_code
            mapping_status_value = status.value
            resolution_method = resolution.method
        except KaveriUnavailableError:
            logger.exception("KAVERI API error during resolution for %s", kgis_village_code)
            return _unavailable(
                GuidelineValueUnavailableReason.KAVERI_API_ERROR,
                "Kaveri service is temporarily unavailable.",
                debug_detail="kaveri_api_error during District/Taluk/Hobli/Village resolution",
            )
        except Exception:  # noqa: BLE001 - never surface a 500 / "Failed to fetch"
            logger.exception("Unexpected error during resolution for %s", kgis_village_code)
            return _unavailable(
                GuidelineValueUnavailableReason.KAVERI_API_ERROR,
                "Kaveri service is temporarily unavailable.",
                debug_detail="unexpected error during resolution",
            )
    else:
        logger.info(
            "MAPPING lookup: FOUND | kgisVillageCode=%s -> kaveriVillageCode=%s | "
            "kaveriDistrictCode=%s kaveriTalukCode=%s kaveriHobliCode=%s | status=%s",
            mapping.kgis_village_code, mapping.kaveri_village_code,
            mapping.kaveri_district_code, mapping.kaveri_taluk_code, mapping.kaveri_hobli_code,
            mapping.mapping_status.value,
        )
        kaveri_village_code = mapping.kaveri_village_code
        kaveri_hobli_code = mapping.kaveri_hobli_code
        village_name_for_road = village_name_for_road or mapping.village_name
        mapping_status_value = mapping.mapping_status.value
        resolution_method = mapping.mapping_method or "db_crosswalk"
        # A PENDING_REVIEW mapping is usable (it already cleared the resolver's
        # score floor) but must never be reported as if it were human-confirmed
        # — the response's `mapping_status` field carries this through so the
        # frontend/debug view can flag it, per spec Part 2.

    # 3. Road + rate resolution -----------------------------------------------
    try:
        async with KaveriSession() as kaveri:
            logger.info(
                "ROAD lookup: POST /api/GetRoadDetailsAsync {villagecode: %s}", kaveri_village_code
            )
            roads = await kaveri.get_roads(kaveri_village_code)
            logger.info(
                "ROAD response: count=%d | names=%s",
                len(roads),
                [extract_value(r, ("roadnamee", "roadname", "name")) for r in roads],
            )
            if not roads:
                return _unavailable(
                    GuidelineValueUnavailableReason.KAVERI_VILLAGE_HAS_NO_ROADS,
                    "No Kaveri guideline rate was found for the resolved location.",
                    debug_detail=(
                        f"kaveri_village_has_no_roads: GetRoadDetailsAsync returned 0 roads "
                        f"for village {kaveri_village_code} (resolved method={resolution_method}) "
                        f"- Kaveri exposes no road/localised rate for this (likely agricultural) "
                        f"village; this is an upstream data characteristic, not a system fault"
                    ),
                )

            road_res = select_road(roads, village_name_for_road, road)
            logger.info(
                "ROAD resolved: code=%s name=%s confidence=%.2f method=%s",
                road_res.road_code, road_res.road_name, road_res.confidence, road_res.method,
            )

            top_entries = await _fetch_rate_entries_cached(
                repo, kaveri, kaveri_village_code, road_res.road_code, classification,
                road_confidence=road_res.confidence, road_resolution_method=road_res.method,
            )
            logger.info(
                "RATE entries on resolved road %s: %s",
                road_res.road_code, [(e["label"], str(e["rate"])) for e in top_entries],
            )

            # No rate on the top-ranked road: only worth checking other
            # candidates when the road wasn't an exact attribute match — an
            # exact match that has no rate is a genuine "not found", not an
            # invitation to substitute a different road (spec Part 7/8).
            if not top_entries and road_res.method != "exact_road_attribute":
                other_hits: list[tuple[RoadCandidate, list[dict]]] = []
                for cand in road_res.ranked[1:MAX_ROAD_CANDIDATES_TO_CHECK]:
                    if cand.code == road_res.road_code:
                        continue
                    cand_entries = await _fetch_rate_entries_cached(
                        repo, kaveri, kaveri_village_code, cand.code, classification,
                        road_confidence=road_res.confidence, road_resolution_method="fallback_candidate_scan",
                    )
                    if cand_entries:
                        other_hits.append((cand, cand_entries))
                logger.info(
                    "ROAD fallback scan: checked=%d candidates, hits=%d",
                    min(len(road_res.ranked) - 1, MAX_ROAD_CANDIDATES_TO_CHECK - 1), len(other_hits),
                )
                if len(other_hits) == 1:
                    cand, cand_entries = other_hits[0]
                    road_res = replace(
                        road_res,
                        road_code=cand.code,
                        road_name=cand.name,
                        confidence=min(road_res.confidence, 0.7),
                        method="only_rated_candidate",
                    )
                    top_entries = cand_entries
                elif len(other_hits) > 1:
                    candidates = [
                        RatedRoadCandidate(
                            road_code=c.code, road_name=c.name,
                            rates=sorted({f"{e['label']}:{e['rate']}" for e in entries}),
                        )
                        for c, entries in other_hits
                    ]
                    logger.info(
                        "ROAD selection required: %d candidate roads carry a rate", len(candidates)
                    )
                    return GuidelineValueRoadSelectionRequiredResponse(candidates=candidates)

            # The primary village's own roads are exhausted with no rate at
            # all. Before declaring "not found", check for a sibling Kaveri
            # village in the SAME hobli (spec Part 10's "duplicate/alternate
            # village entries") — a real, recurring Kaveri pattern where a
            # bare administrative village record (e.g. "Beltangadi") is an
            # empty placeholder and a second record in the same hobli (e.g.
            # "Beltangadi Town") carries the actual published rates. Only
            # engaged once the primary village is proven empty; never
            # substituted just because it happens to have a rate — a single
            # hit auto-resolves (with a visibly reduced confidence + a
            # distinct `sibling_village_match` method), multiple hits go to
            # `road_selection_required` instead of guessing between them.
            if not top_entries and kaveri_hobli_code:
                hobli_villages = await kaveri.get_villages(kaveri_hobli_code)
                siblings = find_sibling_villages(
                    village_name_for_road or "", hobli_villages, kaveri_village_code
                )
                logger.info(
                    "SIBLING VILLAGE scan: hobli=%s primary_village=%s -> %d candidate(s): %s",
                    kaveri_hobli_code, kaveri_village_code, len(siblings), [s.name for s in siblings],
                )
                sibling_hits: list[tuple[Any, Any, list[dict]]] = []
                for sib in siblings[:MAX_SIBLING_VILLAGES_TO_CHECK]:
                    sib_roads = await kaveri.get_roads(sib.code)
                    if not sib_roads:
                        continue
                    sib_road_res = select_road(sib_roads, village_name_for_road, road)
                    sib_entries = await _fetch_rate_entries_cached(
                        repo, kaveri, sib.code, sib_road_res.road_code, classification,
                        road_confidence=sib_road_res.confidence, road_resolution_method=sib_road_res.method,
                    )
                    for cand in sib_road_res.ranked[1:MAX_ROADS_PER_SIBLING]:
                        if sib_entries:
                            break
                        cand_entries = await _fetch_rate_entries_cached(
                            repo, kaveri, sib.code, cand.code, classification,
                            road_confidence=sib_road_res.confidence, road_resolution_method="fallback_candidate_scan",
                        )
                        if cand_entries:
                            sib_road_res = replace(sib_road_res, road_code=cand.code, road_name=cand.name)
                            sib_entries = cand_entries
                    if sib_entries:
                        sibling_hits.append((sib, sib_road_res, sib_entries))
                logger.info(
                    "SIBLING VILLAGE scan result: %d of %d candidate(s) carry a rate",
                    len(sibling_hits), min(len(siblings), MAX_SIBLING_VILLAGES_TO_CHECK),
                )

                if len(sibling_hits) == 1:
                    sib, sib_road_res, sib_entries = sibling_hits[0]
                    logger.info(
                        "SIBLING VILLAGE auto-resolved: village=%s (%s) road=%s",
                        sib.name, sib.code, sib_road_res.road_name,
                    )
                    kaveri_village_code = sib.code
                    road_res = replace(
                        sib_road_res,
                        confidence=min(sib_road_res.confidence, 0.6),
                        method="sibling_village_match",
                    )
                    top_entries = sib_entries
                elif len(sibling_hits) > 1:
                    candidates = [
                        RatedRoadCandidate(
                            road_code=r.road_code, road_name=f"{sib.name}: {r.road_name}",
                            rates=sorted({f"{e['label']}:{e['rate']}" for e in entries}),
                        )
                        for sib, r, entries in sibling_hits
                    ]
                    logger.info(
                        "ROAD selection required across sibling villages: %d candidates", len(candidates)
                    )
                    return GuidelineValueRoadSelectionRequiredResponse(candidates=candidates)

            if not top_entries:
                reason = (
                    GuidelineValueUnavailableReason.AGRICULTURAL_RATE_NOT_FOUND
                    if classification.classification == "agricultural"
                    else GuidelineValueUnavailableReason.NON_AGRICULTURAL_RATE_NOT_FOUND
                    if classification.classification == "non_agricultural"
                    else GuidelineValueUnavailableReason.NO_KAVERI_RATE_FOR_ANY_TYPE
                )
                detail = (
                    f"{reason.value}: village={kaveri_village_code} road={road_res.road_code} "
                    f"classification={classification.classification} "
                    f"(primary village and same-hobli sibling villages exhausted)"
                )
                logger.info("SR RATE not found: %s", detail)
                return _unavailable(
                    reason, "No Kaveri guideline rate was found for the resolved location.", debug_detail=detail
                )

            # Classification-ambiguity cases. CRITICAL: when the parcel's own
            # classification is "unknown", Kaveri having exactly ONE rate
            # candidate on the resolved road is NOT evidence of what the
            # parcel is — it only means Kaveri's local pricing area happens
            # to define one category there. A prior version treated a lone
            # candidate as an implicit answer (effective_classification_source
            # = "single_available_rate"), which is exactly backwards: it let
            # "Kaveri has a Residential rate here" stand in for "this parcel
            # is Residential" for agricultural/forest/every other parcel that
            # simply hadn't had its real classification resolved yet (spec:
            # "the existence of one Residential rate must never be used as
            # proof the parcel is Residential"). Selection is required
            # whenever classification is unknown, REGARDLESS of candidate
            # count. A non-agricultural parcel whose SUBTYPE (Residential vs
            # Commercial vs Industrial) is unresolved is different — there,
            # the top-level classification is already confidently established
            # by real evidence, so a single available subtype is a legitimate
            # (if low-confidence) inference, not a guess about the parcel's
            # fundamental land use.
            distinct_labels = {e["label"] for e in top_entries}
            needs_property_type_selection = classification.classification == "unknown" or (
                classification.classification == "non_agricultural"
                and classification.subtype is None
                and len(distinct_labels) > 1
            )

            if needs_property_type_selection:
                candidates = [
                    PropertyTypeCandidate(property_type=e["label"], rate=e["rate"], rate_unit=e["rate_unit"])
                    for e in top_entries
                ]
                logger.info(
                    "CLASSIFICATION selection required: %d property types available on road %s",
                    len(candidates), road_res.road_code,
                )
                return GuidelineValueClassificationRequiredResponse(candidates=candidates)

            # Classification is confidently agricultural, but Kaveri's own
            # agricultural rate list for a road routinely carries several
            # distinct categories at once (verified live: a single road can
            # return Bagayat Dry/Wet/Coconut/Arecanut/Plantation simultaneously,
            # each a different rate). Knowing "agricultural" is not knowing
            # WHICH category — resolve it from RTC crop/irrigation evidence,
            # never by picking the first entry (that was the actual root cause
            # of different parcels in the same village showing identical
            # arbitrary rates).
            rate_category_confidence: float | None = None
            rate_category_source: str | None = None
            if classification.classification == "agricultural" and len(distinct_labels) > 1:
                options = [
                    KaveriCategoryOption(
                        label=e["label"], normalized=normalize_kaveri_label(e["label"]),
                        rate=e["rate"], rate_unit=e["rate_unit"],
                    )
                    for e in top_entries
                ]
                agri_res = resolve_agricultural_category(options, crops=crops, irrigation_source=bhoomi_irrigation)
                logger.info(
                    "AGRICULTURAL CATEGORY resolution: %d distinct categories, crops=%s irrigation=%s "
                    "-> resolved=%s confidence=%.2f source=%s",
                    len(distinct_labels), crops, bhoomi_irrigation,
                    agri_res.resolved_label, agri_res.confidence, agri_res.source,
                )
                if agri_res.resolved_label is None:
                    candidates = [
                        PropertyTypeCandidate(property_type=e["label"], rate=e["rate"], rate_unit=e["rate_unit"])
                        for e in top_entries
                    ]
                    return GuidelineValueRateCategorySelectionRequiredResponse(
                        land_type="Agriculture", candidates=candidates
                    )
                top_entries = [e for e in top_entries if e["label"] == agri_res.resolved_label]
                distinct_labels = {agri_res.resolved_label}
                rate_category_confidence = agri_res.confidence
                rate_category_source = agri_res.source

            # By this point classification.classification is never "unknown"
            # (that always returned classification_required above) — it is
            # either a real evidence-backed classification, or a
            # non_agricultural parcel with exactly one available subtype.
            selected = top_entries[0]
            effective_classification_confidence = classification.confidence
            effective_classification_source = classification.source

            standard_rate = selected["rate"]
            rate_unit = selected["rate_unit"]
            land_type = selected["label"]
            available_rates = sorted({f"{e['label']}:{e['rate']}" for e in top_entries})

            logger.info(
                "SR RATE success: village=%s road=%s land_type=%s rate=%s unit=%s area=%s",
                kaveri_village_code, road_res.road_code, land_type, standard_rate, rate_unit, area,
            )
            try:
                await repo.upsert_rate_cache(
                    kaveri_village_code,
                    road_res.road_code or "",
                    land_type,
                    standard_rate,
                    rate_unit=rate_unit,
                    road_confidence=Decimal(str(round(road_res.confidence, 3))),
                    road_resolution_method=road_res.method,
                    classification=classification.classification,
                )
            except SQLAlchemyError:
                logger.exception(
                    "RATE CACHE write (selected entry) failed for village=%s road=%s — "
                    "continuing, the resolved rate is still returned to the caller",
                    kaveri_village_code, road_res.road_code,
                )
                await repo.rollback()
            estimated_value = land_unit.guideline_value(area, standard_rate, rate_unit)
            return GuidelineValueResponse(
                standard_rate=standard_rate,
                rate_unit=rate_unit,
                plot_area_sqm=area,
                estimated_land_value=estimated_value,
                property_type=land_type,
                land_type=land_type,
                available_rates=available_rates or None,
                classification_confidence=effective_classification_confidence,
                classification_source=effective_classification_source,
                road_confidence=road_res.confidence,
                road_resolution_method=road_res.method,
                mapping_status=mapping_status_value,
                rate_category_confidence=rate_category_confidence,
                rate_category_source=rate_category_source,
            )
    except KaveriUnavailableError:
        logger.exception(
            "KAVERI API error during road/rate lookup for village=%s", kaveri_village_code
        )
        return _unavailable(
            GuidelineValueUnavailableReason.KAVERI_API_ERROR,
            "Kaveri service is temporarily unavailable.",
            debug_detail=(
                "kaveri_api_error during GetRoadDetailsAsync / "
                "SearchVacantTypeRateDetails / SearchAgriculturalPropertyType"
            ),
        )
    except Exception:  # noqa: BLE001 - never surface a 500 / "Failed to fetch"
        logger.exception(
            "Unexpected error during road/rate lookup for village=%s", kaveri_village_code
        )
        return _unavailable(
            GuidelineValueUnavailableReason.KAVERI_API_ERROR,
            "Kaveri service is temporarily unavailable.",
            debug_detail="unexpected error during road/rate lookup",
        )


# ---------------------------------------------------------------------------
# Dev-only diagnostic endpoints (spec Parts 17/18).
#
# These exist purely so a developer can inspect the *generic* resolver's
# decision trace and the *raw* Kaveri rate catalogue for a village, without
# guessing why a mapping resolved (or failed) the way it did. They are gated
# behind KAVERI_DIAGNOSTICS_ENABLED=1 and must NEVER be wired into the
# production pricing flow or the frontend's happy path.
# ---------------------------------------------------------------------------

_DIAGNOSTICS_ENABLED = os.environ.get("KAVERI_DIAGNOSTICS_ENABLED") == "1"


def _require_diagnostics_enabled() -> None:
    if not _DIAGNOSTICS_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/guideline/resolve-location-debug")
async def resolve_location_debug(
    district: str = Query(..., description="KGIS district name (e.g. 'Dharwad')"),
    taluk: str = Query(..., description="KGIS taluk name (e.g. 'Kundgol')"),
    hobli: str = Query(..., description="KGIS hobli name (e.g. 'Sanshi')"),
    village: str = Query(..., description="KGIS village name (e.g. 'Yare Bhudhihala')"),
    kgis_village_code: str | None = Query(
        None, description="Optional KGIS village code (used only for Bhoomi district corroboration)"
    ),
) -> dict:
    """Dev-only: return the generic resolver's full decision trace for a
    KGIS location (district/taluk/hobli/village) against the live Kaveri
    hierarchy. See :func:`resolve_kaveri_location_debug`."""
    _require_diagnostics_enabled()
    try:
        async with KaveriSession() as kaveri:
            return await resolve_kaveri_location_debug(
                kaveri, district, taluk, hobli, village, kgis_village_code
            )
    except KaveriUnavailableError:
        raise HTTPException(status_code=502, detail="Kaveri service unavailable")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"resolver debug error: {exc}")


@router.get("/api/guideline/rate-catalogue-debug")
async def rate_catalogue_debug(
    village_code: str = Query(
        ..., description="Kaveri village code (e.g. 31942). Fetches raw roads + rates."
    ),
) -> dict:
    """Dev-only: return the raw Kaveri rate catalogue (roads + vacant +
    agricultural rates) for a Kaveri village code, so a developer can see
    exactly what data Kaveri exposes for a village — e.g. confirm whether a
    village genuinely has zero roads/rates (upstream data characteristic) vs.
    a system bug."""
    _require_diagnostics_enabled()
    try:
        async with KaveriSession() as kaveri:
            roads = await kaveri.get_roads(village_code)
            catalogue: list[dict] = []
            for r in roads:
                road_code = extract_value(r, ("roadcode", "road_code", "code"))
                road_name = extract_value(r, ("roadnamee", "roadname", "name"))
                vacant = await kaveri.get_vacant_rate(road_code) if road_code else []
                agri = await kaveri.get_agricultural_rate(road_code) if road_code else []
                catalogue.append(
                    {
                        "road_code": road_code,
                        "road_name": road_name,
                        "vacant_rate_raw": vacant,
                        "agricultural_rate_raw": agri,
                    }
                )
            return {
                "village_code": village_code,
                "road_count": len(roads),
                "roads": catalogue,
            }
    except KaveriUnavailableError:
        raise HTTPException(status_code=502, detail="Kaveri service unavailable")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"rate catalogue debug error: {exc}")
