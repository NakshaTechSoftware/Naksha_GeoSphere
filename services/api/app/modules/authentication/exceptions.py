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


class LoginFailedError(AuthError):
    code = "LOGIN_FAILED"

    def __init__(self) -> None:
        super().__init__("Sign in could not be completed.")


class InvalidOrExpiredCodeError(AuthError):
    """Raised when an email-verification OTP can't be confirmed — wrong
    code, expired, or too many failed attempts. Keeps the message generic
    — never reveal which of those applies."""

    code = "INVALID_OR_EXPIRED_CODE"

    def __init__(self) -> None:
        super().__init__("This verification code is invalid or has expired.")


class InvalidCredentialsError(AuthError):
    """Raised for a login with an unknown email or wrong password — the
    message deliberately matches for both so attackers can't tell which
    part of the credential pair was wrong."""

    code = "INVALID_CREDENTIALS"

    def __init__(self) -> None:
        super().__init__("Invalid email or password.")


class EmailNotVerifiedError(AuthError):
    """Raised when a pending-verification account tries to log in — the
    OTP must be entered first. Deliberately distinct from
    `InvalidCredentialsError` so the UI can point the user at the
    verification step."""

    code = "EMAIL_NOT_VERIFIED"

    def __init__(self) -> None:
        super().__init__("Please verify your email before signing in.")


class GoogleAuthError(AuthError):
    """Raised when the Google OAuth exchange fails (bad code, network
    error, unconfigured credentials, or a missing/unknown email)."""

    code = "GOOGLE_AUTH_ERROR"

    def __init__(self) -> None:
        super().__init__("Google sign-in could not be completed.")


class InvalidGoogleSessionError(AuthError):
    """Raised when the post-callback sign-in ticket is unknown, expired,
    or already consumed."""

    code = "GOOGLE_SESSION_INVALID"

    def __init__(self) -> None:
        super().__init__("This sign-in session is invalid or has expired.")


class GitHubAuthError(AuthError):
    """Raised when the GitHub OAuth exchange fails (bad code, network
    error, or unconfigured credentials)."""

    code = "GITHUB_AUTH_ERROR"

    def __init__(self) -> None:
        super().__init__("GitHub sign-in could not be completed.")


class GitHubEmailMissingError(AuthError):
    """Raised when the GitHub account exposes no usable email address —
    GitHub hides emails unless the app requests them, and we never create
    an account without a verified email."""

    code = "GITHUB_EMAIL_MISSING"

    def __init__(self) -> None:
        super().__init__(
            "No email found on your GitHub account. Add a public email in your "
            "GitHub profile and try again."
        )


