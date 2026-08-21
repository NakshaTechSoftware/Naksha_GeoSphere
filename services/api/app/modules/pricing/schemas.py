"""Response schemas for the pricing module's guideline-value endpoint."""

from __future__ import annotations

import enum
from decimal import Decimal

from pydantic import BaseModel


class GuidelineValueUnavailableReason(str, enum.Enum):
    """Matches the task spec's error-handling section 1:1 — the frontend
    maps each reason to the exact string the spec calls for. The granular
    `*_match_failed` / `road_not_found` / `sr_rate_not_found` / `kaveri_api_error`
    values are the debug reasons surfaced by the live resolver so a failing
    parcel click can be pinpointed to the exact step that broke."""

    MAPPING_MISSING = "mapping_missing"  # no usable mapping and resolution failed
    DISTRICT_MATCH_FAILED = "district_match_failed"
    TALUK_MATCH_FAILED = "taluk_match_failed"
    HOBLI_MATCH_FAILED = "hobli_match_failed"
    VILLAGE_MATCH_FAILED = "village_match_failed"
    ROAD_NOT_FOUND = "road_not_found"
    SR_RATE_NOT_FOUND = "sr_rate_not_found"
    NO_SR_RATE_FOR_AVAILABLE_ROADS = "no_sr_rate_for_available_roads"
    NO_KAVERI_RATE_FOR_ANY_TYPE = "no_kaveri_rate_for_any_type"
    KAVERI_API_ERROR = "kaveri_api_error"
    # Legacy aliases retained for backward compatibility with older clients.
    ROAD_UNAVAILABLE = "road_unavailable"
    RATE_UNAVAILABLE = "rate_unavailable"
    UPSTREAM_ERROR = "upstream_error"


class GuidelineValueResponse(BaseModel):
    status: str = "ok"
    standard_rate: Decimal
    plot_area_sqm: Decimal
    estimated_land_value: Decimal
    # The land type actually used to compute the rate (Agricultural / Residential /
    # Commercial / Vacant-Open Land). May differ from the requested `property_type`
    # once property-type discovery picks the highest-priority available rate.
    property_type: str
    land_type: str | None = None
    source: str = "Kaveri Online Services"
    # Every rate Kaveri returned for this parcel, e.g. ["Agricultural:500",
    # "Residential:3700"], surfaced so the popup can show all options.
    available_rates: list[str] | None = None


class GuidelineValueUnavailableResponse(BaseModel):
    status: str = "unavailable"
    reason: GuidelineValueUnavailableReason
    message: str
    # Optional debug context (candidate counts, scores, raw responses) so a
    # failing parcel click is diagnosable from the API response itself.
    debug_detail: str | None = None
