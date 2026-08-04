"""Translates authentication-module domain errors (and request-body
validation errors) into the API's structured error envelope. Registered
globally in `app.main.create_app` alongside the existing catch-all
handler — never leaks a stack trace or SQL detail to the client."""

from __future__ import annotations

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.modules.authentication.exceptions import (
    AuthError,
    DatabaseUnavailableError,
    EmailAlreadyRegisteredError,
    InvalidOrExpiredTokenError,
    InvalidRoleOrUseCaseError,
    PasswordsDoNotMatchError,
    RegistrationFailedError,
    RegistrationRateLimitedError,
    TermsNotAcceptedError,
)

_STATUS_BY_ERROR: dict[type[AuthError], int] = {
    PasswordsDoNotMatchError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    TermsNotAcceptedError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    InvalidRoleOrUseCaseError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    InvalidOrExpiredTokenError: status.HTTP_422_UNPROCESSABLE_ENTITY,
    EmailAlreadyRegisteredError: status.HTTP_409_CONFLICT,
    RegistrationRateLimitedError: status.HTTP_429_TOO_MANY_REQUESTS,
    DatabaseUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
    RegistrationFailedError: status.HTTP_500_INTERNAL_SERVER_ERROR,
}


async def auth_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AuthError)  # noqa: S101 — handler is only ever registered for AuthError
    status_code = _STATUS_BY_ERROR.get(type(exc), status.HTTP_400_BAD_REQUEST)
    headers = None
    if isinstance(exc, RegistrationRateLimitedError):
        headers = {"Retry-After": str(exc.retry_after_seconds)}
    return JSONResponse(
        status_code=status_code,
        content={"error_code": exc.code, "message": exc.message},
        headers=headers,
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    fields: dict[str, str] = {}
    for error in exc.errors():
        loc = [str(part) for part in error["loc"] if part != "body"]
        field_name = ".".join(loc) if loc else "__root__"
        fields[field_name] = error["msg"]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_code": "VALIDATION_ERROR",
            "message": "One or more fields are invalid.",
            "fields": fields,
        },
    )
