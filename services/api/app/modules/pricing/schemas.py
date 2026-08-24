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
    MAPPING_MISSING_SOURCE_ABSENT = "mapping_missing_source_absent"  # searched taluk(s); village genuinely absent
    DISTRICT_MATCH_FAILED = "district_match_failed"
    TALUK_MATCH_FAILED = "taluk_match_failed"
    HOBLI_MATCH_FAILED = "hobli_match_failed"
    VILLAGE_MATCH_FAILED = "village_match_failed"
    ROAD_NOT_FOUND = "road_not_found"
    # More precise successors to the generic ROAD_NOT_FOUND (spec Part 13) — each
    # isolates a distinct, diagnosable failure so the UI can present the exact
    # reason rather than a catch-all "road not found":
    KAVERI_VILLAGE_HAS_NO_ROADS = "kaveri_village_has_no_roads"
    KAVERI_VILLAGE_MAPPING_SUSPECT = "kaveri_village_mapping_suspect"
    KAVERI_ROAD_RESPONSE_SHAPE_CHANGED = "kaveri_road_response_shape_changed"
    KAVERI_LOCALITY_NOT_AVAILABLE = "kaveri_locality_not_available"
    KAVERI_RATE_SOURCE_ABSENT = "kaveri_rate_source_absent"
    SR_RATE_NOT_FOUND = "sr_rate_not_found"
    NO_SR_RATE_FOR_AVAILABLE_ROADS = "no_sr_rate_for_available_roads"
    NO_KAVERI_RATE_FOR_ANY_TYPE = "no_kaveri_rate_for_any_type"
    AGRICULTURAL_RATE_NOT_FOUND = "agricultural_rate_not_found"
    NON_AGRICULTURAL_RATE_NOT_FOUND = "non_agricultural_rate_not_found"
    PROPERTY_TYPE_RATE_NOT_FOUND = "property_type_rate_not_found"
    RATE_UNIT_UNKNOWN = "rate_unit_unknown"
    INVALID_PLOT_AREA = "invalid_plot_area"
    KAVERI_API_ERROR = "kaveri_api_error"
    KAVERI_RESPONSE_SHAPE_CHANGED = "kaveri_response_shape_changed"
    KAVERI_TIMEOUT = "kaveri_timeout"
    # Legacy aliases retained for backward compatibility with older clients.
    ROAD_UNAVAILABLE = "road_unavailable"
    RATE_UNAVAILABLE = "rate_unavailable"
    UPSTREAM_ERROR = "upstream_error"


class RatedRoadCandidate(BaseModel):
    """One road/locality Kaveri returned for the village, with whatever rate(s)
    were found on it — used by the `road_selection_required` response so the
    frontend can offer a picker instead of the backend guessing."""

    road_code: str
    road_name: str
    rates: list[str]  # e.g. ["Residential:3700", "Commercial:5200"]


class PropertyTypeCandidate(BaseModel):
    """One Kaveri-supported property type found for the parcel's resolved
    road, used by the `classification_unknown` response."""

    property_type: str
    rate: Decimal
    rate_unit: str


class GuidelineValueResponse(BaseModel):
    status: str = "ok"
    standard_rate: Decimal
    rate_unit: str
    plot_area_sqm: Decimal
    plot_area_unit: str = "sq.m"
    estimated_land_value: Decimal
    # The land type actually used to compute the rate (Agricultural / Residential /
    # Commercial / Vacant-Open Land / Industrial). Reflects the resolved
    # classification, never a hardcoded "Residential" default.
    property_type: str
    land_type: str | None = None
    source: str = "Kaveri Online Services"
    # Every rate Kaveri returned for this parcel, e.g. ["Agricultural:500",
    # "Residential:3700"], surfaced so the popup can show all options.
    available_rates: list[str] | None = None
    # Confidence + provenance (spec Part 13) — never shown as raw debug info
    # in production UI, but always present so the frontend can decide how to
    # present the result (e.g. "rate matched using nearest road").
    classification_confidence: float
    classification_source: str
    road_confidence: float
    road_resolution_method: str
    mapping_status: str
    # Set only when the specific rate category had to be disambiguated among
    # several available on the resolved road (e.g. which agricultural
    # category among Bagayat Dry/Wet/Coconut/...) — spec Part 17.
    rate_category_confidence: float | None = None
    rate_category_source: str | None = None


class GuidelineValueUnavailableResponse(BaseModel):
    status: str = "unavailable"
    reason: GuidelineValueUnavailableReason
    message: str
    # Optional debug context (candidate counts, scores, raw responses) so a
    # failing parcel click is diagnosable from the API response itself.
    debug_detail: str | None = None


class GuidelineValueRoadSelectionRequiredResponse(BaseModel):
    """Kaveri has multiple road/locality rates for this village and the
    resolver could not confidently pick one for this parcel (spec Part 7) —
    never silently substitute a road just because it happens to have a rate."""

    status: str = "road_selection_required"
    message: str = "Multiple Kaveri road/locality rates found. Select the applicable road/locality."
    candidates: list[RatedRoadCandidate]


class GuidelineValueClassificationRequiredResponse(BaseModel):
    """The parcel's land classification could not be determined from any
    available evidence (spec Part 3) — every Kaveri rate found for the
    resolved road is surfaced instead of guessing one."""

    status: str = "classification_unknown"
    message: str = "Land classification could not be determined. Select the applicable property type."
    candidates: list[PropertyTypeCandidate]


class GuidelineValueRateCategorySelectionRequiredResponse(BaseModel):
    """Classification itself (agricultural vs non-agricultural, or a
    non-agricultural subtype) IS known, but the specific Kaveri rate category
    within it is not — e.g. Agriculture is confirmed but Bagayat Dry / Wet /
    Coconut / Arecanut / Plantation cannot be distinguished from the
    available evidence. Distinct from `classification_unknown`, whose
    ambiguity is at the classification level itself."""

    status: str = "rate_category_selection_required"
    message: str = "Multiple Kaveri rate categories may apply. Select the applicable category."
    land_type: str
    candidates: list[PropertyTypeCandidate]
