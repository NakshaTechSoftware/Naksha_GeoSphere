"""Translates environment-module domain errors into the API's structured
error envelope. Registered globally in `app.main.create_app` alongside the
existing `AuthError` handler — never leaks a stack trace or upstream
provider detail to the client."""

from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.modules.environment.exceptions import (
    CpcbApiKeyMissingError,
    EnvironmentError,
    InvalidCoordinatesError,
    StationNotFoundError,
    UpstreamUnavailableError,
)

_STATUS_BY_ERROR: dict[type[EnvironmentError], int] = {
    InvalidCoordinatesError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    UpstreamUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
    StationNotFoundError: status.HTTP_404_NOT_FOUND,
    CpcbApiKeyMissingError: status.HTTP_503_SERVICE_UNAVAILABLE,
}


async def environment_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, EnvironmentError)  # noqa: S101 — handler only ever registered for EnvironmentError
    status_code = _STATUS_BY_ERROR.get(type(exc), status.HTTP_400_BAD_REQUEST)
    return JSONResponse(
        status_code=status_code,
        content={"error_code": exc.code, "message": exc.message},
    )
