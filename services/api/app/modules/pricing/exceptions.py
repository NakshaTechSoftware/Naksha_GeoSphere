"""Domain exceptions for the pricing module.

Raised by `kaveri_client`/the router's orchestration and translated to the
task spec's exact user-facing strings in `app.api.v1.pricing` — mirrors
`app.modules.environment.exceptions`'s shape (a typed reason the caller
switches on, never a raw traceback reaching the response).
"""

from __future__ import annotations


class PricingError(Exception):
    """Base class for all pricing-module domain errors."""

    code: str = "PRICING_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class VillageMappingNotFoundError(PricingError):
    """No `kaveri_village_mapping` row exists for the given KGIS village
    code. Distinct from an upstream failure — this is a data-coverage gap,
    not a transient outage."""

    code = "VILLAGE_MAPPING_NOT_FOUND"

    def __init__(self, kgis_village_code: str) -> None:
        super().__init__(f"No Kaveri mapping exists for KGIS village code '{kgis_village_code}'.")


class RoadUnavailableError(PricingError):
    """Kaveri returned no road entries for the mapped village."""

    code = "ROAD_UNAVAILABLE"

    def __init__(self) -> None:
        super().__init__("Road information unavailable")


class RateUnavailableError(PricingError):
    """Kaveri returned no SR Rate for the resolved road/property type."""

    code = "RATE_UNAVAILABLE"

    def __init__(self) -> None:
        super().__init__("Guideline value unavailable")


class KaveriUnavailableError(PricingError):
    """The Kaveri portal could not be reached, or a request in the
    District→Taluk→Hobli→Village→Road→Rate chain failed/returned an
    unexpected shape. Everything about this integration is reverse-engineered
    from a written spec, not verified against the live portal — this
    exception is the single place that ambiguity surfaces as a clean error
    instead of an unhandled exception."""

    code = "KAVERI_UNAVAILABLE"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__("Unable to fetch government guideline value")
        self.detail = detail
