"""Shared exception types for the GeoAI Tool Adapter Service."""

from __future__ import annotations


class GeoAIError(Exception):
    """Base class for all handled errors in this service."""

    status_code: int = 500
    error_code: str = "internal_error"

    def __init__(self, message: str, *, error_code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if error_code:
            self.error_code = error_code


class UpstreamError(GeoAIError):
    """An existing GeoSphere API (Next.js BFF or FastAPI backend) failed or timed out."""

    status_code = 502
    error_code = "upstream_error"


class UnsupportedTypeError(GeoAIError):
    """The requested POI type / layer is not one this service knows how to serve."""

    status_code = 400
    error_code = "unsupported_type"


class NotFoundError(GeoAIError):
    """The query was valid but matched nothing."""

    status_code = 404
    error_code = "not_found"


class RateLimitExceededError(GeoAIError):
    status_code = 429
    error_code = "rate_limited"


class UnauthorizedError(GeoAIError):
    status_code = 401
    error_code = "unauthorized"
