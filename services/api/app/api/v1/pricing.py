"""API endpoint for the Kaveri government guideline value ("SR Rate") shown
in the Explore page's cadastral parcel popup.

Orchestration for a click on a parcel:
KGIS village code (+ the parcel's KGIS district/taluk/hobli/village names) ->
kaveri_village_mapping lookup -> on a miss, the live Kaveri resolver is
invoked and the result is persisted (auto-resolve) -> DB rate cache check ->
(on miss) Kaveri Road -> SR Rate lookup, cached -> Site Value calculation.

Every step is logged at INFO (see the task's debug spec) and every failure
mode maps to a granular `GuidelineValueUnavailableReason` (district_match_failed,
road_not_found, sr_rate_not_found, kaveri_api_error, ...) so a failing parcel
click can be pinpointed to the exact step — never a bare "unavailable".
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_session
from app.modules.pricing.exceptions import KaveriUnavailableError
from app.modules.pricing.kaveri_client import KaveriSession
from app.modules.pricing.kaveri_location_resolver import (
    AUTO_CONFIRM_THRESHOLD,
    PENDING_REVIEW_THRESHOLD,
    extract_value,
    resolve_kaveri_location,
    select_road,
)
from app.modules.pricing.models import MappingStatus
from app.modules.pricing.repository import KaveriPricingRepository
from app.modules.pricing.schemas import (
    GuidelineValueResponse,
    GuidelineValueUnavailableReason,
    GuidelineValueUnavailableResponse,
)
from app.modules.pricing.valuation import calculate_site_value

logger = logging.getLogger("pricing")

router = APIRouter(prefix="/pricing", tags=["pricing"])


def _unavailable(
    reason: GuidelineValueUnavailableReason,
    message: str,
    debug_detail: str | None = None,
) -> GuidelineValueUnavailableResponse:
    return GuidelineValueUnavailableResponse(
        reason=reason, message=message, debug_detail=debug_detail
    )


# --- Property-type discovery -------------------------------------------
# A bare cadastral survey parcel has no building, so the guideline rate is
# chosen from whatever Kaveri returns for the village, NOT forced to
# "Residential". Selection priority for an unbuilt parcel (spec):
#   Agricultural > Vacant/Open Land > Residential > Commercial
# Lower rank = higher preference.
_PROPERTY_TYPE_RANK = {
    "agricultural": 1,
    "vacant_open": 2,
    "residential": 3,
    "commercial": 4,
    "other": 5,
}
_PROPERTY_TYPE_LABEL = {
    "agricultural": "Agricultural",
    "vacant_open": "Vacant/Open Land",
    "residential": "Residential",
    "commercial": "Commercial",
    "other": "Other",
}

# Land-use hints taken from the parcel's own GIS attributes (Category /
# Landcode). These only steer WHICH Kaveri endpoint we consult first; they
# never hard-code a rate. Matched case-insensitively, as substrings.
_AGRICULTURAL_KEYWORDS = (
    "agri", "agriculture", "farm", "crop", "cultivation", "horticulture",
    "plantation", "orchard", "nursery", "grazing", "pasture", "garden",
    "paddy", "wetland", "dryland", "dry land", "garden land",
)


def _detect_agricultural(category: str | None, landcode: str | None) -> bool | None:
    """Return True if a GIS attribute clearly says agricultural, False if it
    clearly says a built-up use, or None when the attributes are absent/ambiguous
    (so the caller consults both Kaveri endpoints as a fallback)."""
    for raw in (category, landcode):
        if not raw:
            continue
        n = str(raw).lower()
        if any(k in n for k in _AGRICULTURAL_KEYWORDS):
            return True
        if any(k in n for k in ("residential", "commercial", "building", "urban", "site")):
            return False
    return None


def _classify_property_type(name: str) -> str:
    n = (name or "").lower()
    if "agri" in n:
        return "agricultural"
    # Specific built-up types are checked before the generic "site"/"plot"
    # tokens, so "Commercial Site" / "Residential Plot" don't collapse to
    # Vacant/Open Land.
    if "residential" in n or "residence" in n or "house" in n:
        return "residential"
    if "commercial" in n:
        return "commercial"
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
    for key in ("propertytypename", "agriculturaltypename", "typename", "name", "type"):
        if key in entry and entry[key]:
            return str(entry[key]).strip()
    return ""


def _select_rate(entries: list[dict]) -> dict | None:
    """Pick the highest-priority available rate; ties broken by higher rate."""
    candidates = [e for e in entries if e.get("rate") is not None]
    if not candidates:
        return None
    candidates.sort(key=lambda e: (_PROPERTY_TYPE_RANK[e["bucket"]], -float(e["rate"])))
    return candidates[0]


@router.get(
    "/guideline-value",
    response_model=GuidelineValueResponse | GuidelineValueUnavailableResponse,
)
async def get_guideline_value(
    kgis_village_code: str = Query(..., description="KGIS village code from the clicked parcel."),
    plot_area_sqm: float = Query(..., gt=0, description="Parcel area in square meters."),
    property_type: str = Query(
        "Residential",
        description=(
            "Requested Kaveri property type (a hint; the endpoint discovers the actual land type)."
        ),
    ),
    district: str | None = Query(None, description="KGIS district name."),
    taluk: str | None = Query(None, description="KGIS taluk name."),
    hobli: str | None = Query(None, description="KGIS hobli name."),
    village: str | None = Query(None, description="KGIS village name."),
    road: str | None = Query(None, description="Optional cadastral road attribute."),
    category: str | None = Query(
        None, description="Parcel land Category GIS attribute (drives agricultural detection)."
    ),
    landcode: str | None = Query(
        None, description="Parcel Landcode GIS attribute (drives agricultural detection)."
    ),
    session: AsyncSession = Depends(get_session),
) -> GuidelineValueResponse | GuidelineValueUnavailableResponse:
    repo = KaveriPricingRepository(session)

    # 1. Incoming GIS data -------------------------------------------------
    logger.info(
        "GUIDELINE-VALUE request | KGIS Village Code: %s | Village: %s | District: %s | "
        "Taluk: %s | Hobli: %s | Area: %s | Road: %s | PropertyType: %s | "
        "Category: %s | Landcode: %s",
        kgis_village_code, village, district, taluk, hobli, plot_area_sqm, road,
        property_type, category, landcode,
    )

    try:
        area = Decimal(str(plot_area_sqm))
    except InvalidOperation:
        logger.exception("GUIDELINE-VALUE invalid plot area: %s", plot_area_sqm)
        return _unavailable(
            GuidelineValueUnavailableReason.KAVERI_API_ERROR,
            "Unable to fetch government guideline value",
            debug_detail="invalid plot_area_sqm",
        )

    # 2. Mapping lookup ----------------------------------------------------
    mapping = await repo.get_mapping_by_kgis_code(kgis_village_code)
    village_name_for_road = village

    if mapping is None:
        logger.info("MAPPING lookup: NOT FOUND for kgis_village_code=%s", kgis_village_code)
        # No curated mapping yet — resolve live from the parcel's own KGIS
        # hierarchy attributes and persist the result (auto-resolve). Without
        # the names we cannot resolve at all.
        if not (district and taluk and hobli and village):
            logger.info("MAPPING missing and KGIS names incomplete -> mapping_missing")
            return _unavailable(
                GuidelineValueUnavailableReason.MAPPING_MISSING,
                "Guideline value unavailable for this location",
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
                # Pinpoint exactly which level failed to produce a candidate.
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
                    f"village={resolution.village_score:.1f}"
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
                )
                await repo.commit()
                return _unavailable(
                    reason, "Guideline value unavailable for this location", debug_detail=detail
                )

            if resolution.confidence < PENDING_REVIEW_THRESHOLD:
                # Resolved a village but not confidently enough (<80%).
                detail = (
                    f"mapping_missing: low confidence={resolution.confidence:.1f} "
                    f"(district={resolution.district_score:.1f} taluk={resolution.taluk_score:.1f} "
                    f"hobli={resolution.hobli_score:.1f} village={resolution.village_score:.1f})"
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
                )
                await repo.commit()
                return _unavailable(
                    GuidelineValueUnavailableReason.MAPPING_MISSING,
                    "Guideline value unavailable for this location",
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
            )
            await repo.commit()
            kaveri_village_code = resolution.kaveri_village_code
        except KaveriUnavailableError:
            logger.exception("KAVERI API error during resolution for %s", kgis_village_code)
            return _unavailable(
                GuidelineValueUnavailableReason.KAVERI_API_ERROR,
                "Unable to fetch government guideline value",
                debug_detail="kaveri_api_error during District/Taluk/Hobli/Village resolution",
            )
        except Exception:  # noqa: BLE001 - never surface a 500 / "Failed to fetch"
            logger.exception("Unexpected error during resolution for %s", kgis_village_code)
            return _unavailable(
                GuidelineValueUnavailableReason.KAVERI_API_ERROR,
                "Unable to fetch government guideline value",
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
        village_name_for_road = village_name_for_road or mapping.village_name

    # 3. Rate cache --------------------------------------------------------
    cached = await repo.get_fresh_rate_cache_for_village(kaveri_village_code)
    if cached is not None:
        logger.info(
            "RATE cache HIT for village=%s land_type=%s -> rate=%s",
            kaveri_village_code, cached.property_type, cached.standard_rate,
        )
        estimated_value = calculate_site_value(area, cached.standard_rate)
        return GuidelineValueResponse(
            standard_rate=cached.standard_rate,
            plot_area_sqm=area,
            estimated_land_value=estimated_value,
            property_type=cached.property_type,
            land_type=cached.property_type,
        )

    # 4. Road lookup -------------------------------------------------------
    try:
        async with KaveriSession() as kaveri:
            logger.info(
                "ROAD lookup: POST /api/GetRoadDetailsAsync {villagecode: %s}", kaveri_village_code
            )
            roads = await kaveri.get_roads(kaveri_village_code)
            road_summary = [
                (
                    extract_value(r, ("roadcode", "code")),
                    extract_value(r, ("roadnamee", "roadname", "name")),
                )
                for r in roads
            ]
            logger.info(
                "ROAD response: count=%d | codes=%s | names=%s",
                len(roads), [c for c, _ in road_summary], [n for _, n in road_summary],
            )
            if not roads:
                logger.info("ROAD not found for village=%s", kaveri_village_code)
                return _unavailable(
                    GuidelineValueUnavailableReason.ROAD_NOT_FOUND,
                    "Road information unavailable",
                    debug_detail=(
                        f"road_not_found: GetRoadDetailsAsync returned 0 roads "
                        f"for village {kaveri_village_code}"
                    ),
                )
            # Iterate ALL returned roads (ranked by village-name match first for
            # determinism) — never blindly roads[0]. Inspect the COMPLETE rate
            # response of each road (not just a "Residential" filter) and let
            # property-type discovery below pick the highest-priority available
            # land type. Only when EVERY road AND the agricultural endpoint are
            # exhausted with no positive rate do we give up.
            all_codes = [extract_value(r, ("roadcode", "code")) for r in roads]
            if not any(all_codes):
                logger.info(
                    "ROAD selection failed (no usable road code) for village=%s",
                    kaveri_village_code,
                )
                return _unavailable(
                    GuidelineValueUnavailableReason.ROAD_NOT_FOUND,
                    "Road information unavailable",
                    debug_detail="road_not_found: no usable road code among returned roads",
                )

            _, _, ranked_roads = select_road(roads, village_name_for_road, road)
            if not ranked_roads:
                ranked_roads = [
                    (
                        extract_value(r, ("roadcode", "code")),
                        extract_value(r, ("roadnamee", "roadname", "name")),
                    )
                    for r in roads
                ]

            is_agri = _detect_agricultural(category, landcode)
            logger.info(
                "LAND-USE detection: category=%r landcode=%r -> is_agricultural=%s",
                category, landcode, is_agri,
            )

            # --- Gather every rate Kaveri can offer for this parcel ----------
            # Each road is checked in turn (ranked by village-name match, i.e.
            # closest to the parcel first). The FIRST road that yields any
            # positive-rate land type is used; within that road the highest-
            # priority land type wins (Agricultural > Vacant/Open > Residential
            # > Commercial). All rates found are still collected for diagnostics.
            selected = None
            all_entries: list[dict] = []
            road_responses: dict[str, object] = {}
            all_road_codes: list[str] = []

            for rcode, _rname in ranked_roads:
                if not rcode:
                    continue
                all_road_codes.append(rcode)
                logger.info(
                    "SR RATE lookup: POST /api/SearchVacantTypeRateDetails {roadcode: %s}",
                    rcode,
                )
                try:
                    rates = await kaveri.get_vacant_rate(rcode)
                except Exception:  # noqa: BLE001
                    logger.exception("SR RATE lookup failed for road %s", rcode)
                    rates = []
                logger.info("SR RATE response (road %s): %s", rcode, rates)
                road_responses[rcode] = rates
                road_entries: list[dict] = []
                for entry in rates:
                    rate = _extract_rate(entry)
                    if rate is None:
                        continue
                    tname = _extract_type_name(entry)
                    bucket = _classify_property_type(tname)
                    e = {
                        "bucket": bucket,
                        "label": tname or _PROPERTY_TYPE_LABEL[bucket],
                        "rate": rate,
                        "source": "vacant",
                        "road_code": rcode,
                    }
                    road_entries.append(e)
                    all_entries.append(e)
                # First road with a usable rate wins (closest to the parcel).
                if selected is None:
                    road_sel = _select_rate(road_entries)
                    if road_sel is not None:
                        selected = road_sel

            # Agricultural endpoint (village-keyed). Consulted when the parcel is
            # detected agricultural (overrides the vacant selection), or as a
            # fallback when the vacant endpoint yielded nothing — never the other
            # way round, so a residential plot is not mis-valued by a low
            # agricultural rate.
            consult_agri = is_agri is True or (is_agri is None and selected is None)
            if consult_agri:
                try:
                    agri_rates = await kaveri.get_agricultural_rate(kaveri_village_code)
                    logger.info(
                        "AGRICULTURAL RATE lookup: POST /api/SearchAgriculturalPropertyType "
                        "{villagecode: %s} -> %s",
                        kaveri_village_code, agri_rates,
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "AGRICULTURAL RATE lookup failed for village %s", kaveri_village_code
                    )
                    agri_rates = []
                agri_entries: list[dict] = []
                for entry in agri_rates:
                    rate = _extract_rate(entry)
                    if rate is None:
                        continue
                    tname = _extract_type_name(entry)
                    bucket = _classify_property_type(tname)
                    e = {
                        "bucket": bucket,
                        "label": tname or _PROPERTY_TYPE_LABEL[bucket],
                        "rate": rate,
                        "source": "agricultural",
                        "road_code": None,
                    }
                    agri_entries.append(e)
                    all_entries.append(e)
                agri_sel = _select_rate(agri_entries)
                if agri_sel is not None:
                    # For a detected-agricultural parcel this overrides the
                    # vacant selection; otherwise it only fills a gap.
                    selected = agri_sel

            # Every rate, for diagnostics (e.g. "Agricultural:500, Residential:3700").
            available_rates = sorted({f"{e['label']}:{e['rate']}" for e in all_entries})
            all_buckets = sorted({e["bucket"] for e in all_entries})
            if selected is None:
                detail = (
                    f"no_kaveri_rate_for_any_supported_type: village={kaveri_village_code} "
                    f"roads_checked={sorted(set(all_road_codes))} "
                    f"property_types_available={all_buckets} "
                    f"available_rates={available_rates}"
                )
                logger.info("SR RATE not found for any supported property type: %s", detail)
                return _unavailable(
                    GuidelineValueUnavailableReason.NO_KAVERI_RATE_FOR_ANY_TYPE,
                    "Guideline value unavailable",
                    debug_detail=detail,
                )

            standard_rate = selected["rate"]
            land_type = _PROPERTY_TYPE_LABEL.get(selected["bucket"], selected["label"])
            matched_road_code = selected.get("road_code")
            logger.info(
                "SR RATE success: village=%s road=%s land_type=%s rate=%s area=%s "
                "available_rates=%s",
                kaveri_village_code, matched_road_code, land_type,
                standard_rate, area, available_rates,
            )
            # upsert_rate_cache commits internally.
            await repo.upsert_rate_cache(
                kaveri_village_code, matched_road_code or "", land_type, standard_rate
            )
            estimated_value = calculate_site_value(area, standard_rate)
            return GuidelineValueResponse(
                standard_rate=standard_rate,
                plot_area_sqm=area,
                estimated_land_value=estimated_value,
                property_type=land_type,
                land_type=land_type,
                available_rates=available_rates or None,
            )
    except KaveriUnavailableError:
        logger.exception(
            "KAVERI API error during road/rate lookup for village=%s", kaveri_village_code
        )
        return _unavailable(
            GuidelineValueUnavailableReason.KAVERI_API_ERROR,
            "Unable to fetch government guideline value",
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
            "Unable to fetch government guideline value",
            debug_detail="unexpected error during road/rate lookup",
        )
