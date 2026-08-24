"""Area/rate unit conversion for guideline-value calculations.

Kaveri's non-agricultural endpoint (`SearchVacantTypeRateDetails`) publishes
rates per square metre — this matches the site-value formula used elsewhere
in the app and needs no conversion.

Kaveri's agricultural endpoint (`SearchAgriculturalPropertyType`) carries NO
unit field on any response we've inspected live (see `kaveri_client.
get_agricultural_rate`'s docstring for a real example). Karnataka's
guideline-value convention for agricultural land is Rupees per acre — this is
a domain convention documented across Kaveri's own public rate-card PDFs, not
a per-village/per-district hardcode, and applies uniformly to every
agricultural rate Kaveri returns. Because the API itself never confirms this,
callers must treat it as an *assumption*, not a verified fact, and surface
that provenance (`rate_unit_source="assumed_domain_convention"`) rather than
claiming it was read from the response.
"""

from __future__ import annotations

from decimal import Decimal

SQM_PER_ACRE = Decimal("4046.8564224")
GUNTA_PER_ACRE = Decimal(40)
SQM_PER_GUNTA = SQM_PER_ACRE / GUNTA_PER_ACRE

# Kaveri's own published unit for each rate endpoint. Not read from any
# response (the API exposes no unit field) — this is the fixed convention the
# portal itself uses, applied uniformly regardless of location.
NON_AGRICULTURAL_RATE_UNIT = "per_sq_m"
AGRICULTURAL_RATE_UNIT = "per_acre"

_SQM_PER_UNIT: dict[str, Decimal] = {
    "per_sq_m": Decimal(1),
    "per_acre": SQM_PER_ACRE,
    "per_gunta": SQM_PER_GUNTA,
}


def guideline_value(area_sqm: Decimal, rate: Decimal, rate_unit: str) -> Decimal:
    """Plot Area (sq.m) x Rate, converting the rate's unit to sq.m first so a
    per-acre agricultural rate is never multiplied directly against a sq.m
    area (a ~4047x error) the way a naive `area * rate` would."""
    sqm_per_unit = _SQM_PER_UNIT.get(rate_unit)
    if sqm_per_unit is None:
        raise ValueError(f"Unknown rate unit: {rate_unit!r}")
    rate_per_sqm = rate / sqm_per_unit
    return area_sqm * rate_per_sqm
