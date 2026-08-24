"""Guideline-value calculation engine, extracted from the Kaveri frontend's
documented formulas.

Every step past site value needs an input a bare cadastral survey parcel
simply doesn't have (floor areas, a corner-plot flag, a parking selection, an
apartment floor number, chosen amenities) — those describe a *built-up
property*, not raw land. So each is an optional keyword argument that
contributes nothing when omitted, rather than a required field the caller has
to fake. Today's parcel-popup call site only ever supplies `site_area_sqm`/
`standard_rate`; the rest exist ready for a future "value a full property"
flow (see the task's own architecture note on this).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class ConstructionInput:
    ground_floor_area_sqm: Decimal
    ground_floor_rate: Decimal
    above_floor_area_sqm: Decimal = Decimal(0)
    above_floor_rate: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class AnnexureRule:
    description: str
    percentage: Decimal


@dataclass(frozen=True, slots=True)
class ParkingSlab:
    """One slab from `/api/FlatParkingRateDetails` — the value that applies
    depends on which slab the computed property value falls into."""

    value_from: Decimal
    value_to: Decimal
    value: Decimal
    is_fixed: bool

    def contains(self, property_value: Decimal) -> bool:
        return self.value_from <= property_value <= self.value_to


@dataclass(frozen=True, slots=True)
class ValuationBreakdown:
    site_value: Decimal
    construction_value: Decimal | None
    annexure_amount: Decimal | None
    parking_amount: Decimal | None
    floor_adjustment: Decimal | None
    amenities_value: Decimal | None
    total: Decimal


def calculate_site_value(site_area_sqm: Decimal, standard_rate: Decimal) -> Decimal:
    """Step 1: Site Value = Plot Area × Standard Rate."""
    return site_area_sqm * standard_rate


def calculate_construction_value(construction: ConstructionInput) -> Decimal:
    """Step 2: Construction Value = (Ground Floor Area × Ground Floor Rate)
    + (Above Floor Area × Above Floor Rate)."""
    return (
        construction.ground_floor_area_sqm * construction.ground_floor_rate
        + construction.above_floor_area_sqm * construction.above_floor_rate
    )


def calculate_annexure_amount(base_value: Decimal, annexures: list[AnnexureRule]) -> Decimal:
    """Step 3: Annexure Amount = Base Value × Percentage / 100, summed over
    every applicable annexure rule (e.g. corner property, road-facing)."""
    return sum(
        (base_value * rule.percentage / Decimal(100) for rule in annexures),
        start=Decimal(0),
    )


def calculate_parking_value(property_value: Decimal, slabs: list[ParkingSlab]) -> Decimal | None:
    """Step 4: whichever slab `property_value` falls into determines the
    parking value. Returns None (not zero) when no slab matches, so the
    caller can distinguish "no parking charge applies" from "parking data
    unavailable for this value" if that distinction ever matters upstream."""
    for slab in slabs:
        if slab.contains(property_value):
            return slab.value
    return None


def calculate_floor_adjustment(base_value: Decimal, floor_percentage: Decimal) -> Decimal:
    """Step 5: Floor Adjustment = Base Value × Floor Percentage / 100."""
    return base_value * floor_percentage / Decimal(100)


def calculate_valuation(
    site_area_sqm: Decimal,
    standard_rate: Decimal,
    *,
    construction: ConstructionInput | None = None,
    annexures: list[AnnexureRule] | None = None,
    parking_property_value: Decimal | None = None,
    parking_slabs: list[ParkingSlab] | None = None,
    floor_adjustment_percent: Decimal | None = None,
    amenities_value: Decimal | None = None,
) -> ValuationBreakdown:
    """Total Property Value = Site Value + Construction Value + Annexure
    Amount + Parking Amount + Floor Adjustment + Amenities Value — each term
    past Site Value only contributes when its inputs are supplied."""
    site_value = calculate_site_value(site_area_sqm, standard_rate)
    total = site_value

    construction_value = None
    if construction is not None:
        construction_value = calculate_construction_value(construction)
        total += construction_value

    annexure_amount = None
    if annexures:
        # Annexure percentages apply against the base (site + construction)
        # value accumulated so far, per the spec's "Base Value" wording.
        annexure_amount = calculate_annexure_amount(total, annexures)
        total += annexure_amount

    parking_amount = None
    if parking_property_value is not None and parking_slabs:
        parking_amount = calculate_parking_value(parking_property_value, parking_slabs)
        if parking_amount is not None:
            total += parking_amount

    floor_adjustment = None
    if floor_adjustment_percent is not None:
        floor_adjustment = calculate_floor_adjustment(total, floor_adjustment_percent)
        total += floor_adjustment

    if amenities_value is not None:
        total += amenities_value

    return ValuationBreakdown(
        site_value=site_value,
        construction_value=construction_value,
        annexure_amount=annexure_amount,
        parking_amount=parking_amount,
        floor_adjustment=floor_adjustment,
        amenities_value=amenities_value,
        total=total,
    )
