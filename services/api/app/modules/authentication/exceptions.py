"""Domain exceptions for the authentication module.

Raised by the service layer and translated to structured HTTP error
responses by `app/modules/authentication/router.py`. Never leak SQL
exceptions, stack traces, or internal database details to the client.
"""

from __future__ import annotations


class AuthError(Exception):
    """Base class for all authentication-module domain errors."""

    code: str = "AUTH_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ValidationFailedError(AuthError):
    code = "VALIDATION_ERROR"


class PasswordsDoNotMatchError(AuthError):
    code = "PASSWORDS_DO_NOT_MATCH"

    def __init__(self) -> None:
        super().__init__("Password and confirm password do not match.")


class TermsNotAcceptedError(AuthError):
    code = "TERMS_NOT_ACCEPTED"

    def __init__(self) -> None:
        super().__init__("Terms of Service and Privacy Policy must be accepted.")


class InvalidRoleOrUseCaseError(AuthError):
    code = "INVALID_ROLE_OR_USE_CASE"

    def __init__(self) -> None:
        super().__init__("Selected role or use case is not supported.")


class EmailAlreadyRegisteredError(AuthError):
    code = "EMAIL_ALREADY_REGISTERED"

    def __init__(self) -> None:
        super().__init__("An account already exists for this email.")


class RegistrationRateLimitedError(AuthError):
    code = "REGISTRATION_RATE_LIMITED"

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Too many registration attempts. Please try again later.")
        self.retry_after_seconds = retry_after_seconds


class DatabaseUnavailableError(AuthError):
    code = "DATABASE_UNAVAILABLE"

    def __init__(self) -> None:
        super().__init__("The database is currently unavailable.")


class RegistrationFailedError(AuthError):
    code = "REGISTRATION_FAILED"

    def __init__(self) -> None:
        super().__init__("Registration could not be completed.")


class InvalidOrExpiredTokenError(AuthError):
    code = "INVALID_OR_EXPIRED_TOKEN"

    def __init__(self) -> None:
        super().__init__("This verification link is invalid or has expired.")
