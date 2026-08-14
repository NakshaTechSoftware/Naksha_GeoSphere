"""Domain exceptions for the environment module.

Raised by the client/aggregation layer and translated to structured HTTP
error responses by `error_handlers.py`. A failed upstream provider (CPCB or
Open-Meteo) must never leak a raw traceback, and one provider failing must
never prevent the others' data from being returned — see
`aggregator.py`, which catches these per-provider rather than letting them
propagate out of the aggregated endpoints.
"""

from __future__ import annotations


class EnvironmentError(Exception):
    """Base class for all environment-module domain errors."""

    code: str = "ENVIRONMENT_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidCoordinatesError(EnvironmentError):
    code = "INVALID_COORDINATES"

    def __init__(self, message: str = "Latitude/longitude are out of range.") -> None:
        super().__init__(message)


class UpstreamUnavailableError(EnvironmentError):
    """A third-party provider could not be reached or returned an error,
    and no usable cached (even stale) data exists to fall back on."""

    code = "UPSTREAM_UNAVAILABLE"

    def __init__(self, provider: str) -> None:
        super().__init__(f"{provider} is temporarily unavailable.")
        self.provider = provider


class StationNotFoundError(EnvironmentError):
    code = "STATION_NOT_FOUND"

    def __init__(self, station_id: str) -> None:
        super().__init__(f"Station '{station_id}' was not found.")


class CpcbApiKeyMissingError(EnvironmentError):
    """The server has no DATA_GOV_IN_API_KEY configured. Distinct from
    UpstreamUnavailableError because it's a configuration issue, not a
    transient provider outage."""

    code = "CPCB_API_KEY_MISSING"

    def __init__(self) -> None:
        super().__init__("Official CPCB AQI data is not configured on this server.")
