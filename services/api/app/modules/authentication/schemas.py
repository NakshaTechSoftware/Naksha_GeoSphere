"""Request/response models for the authentication module.

Field names are snake_case, matching the JSON shape already used
elsewhere in this API (see `app/schemas/health.py`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.modules.authentication.constants import ROLE_OPTIONS
from app.modules.authentication.exceptions import (
    InvalidRoleOrUseCaseError,
    PasswordsDoNotMatchError,
    TermsNotAcceptedError,
)
from app.modules.users.schemas import UserPublic

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    # Optional: unlike full_name, a blank/omitted value is allowed and is
    # normalized to None rather than rejected.
    organization_name: str | None = Field(default=None, max_length=200)
    role_or_use_case: str | None = None
    # Passwords are never trimmed or otherwise modified — a leading/
    # trailing space is significant and must round-trip exactly.
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    confirm_password: str
    accepted_terms: bool

    @field_validator("full_name", mode="after")
    @classmethod
    def _trim_and_require_non_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("must not be blank")
        return trimmed

    @field_validator("organization_name", mode="after")
    @classmethod
    def _normalize_organization_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @field_validator("role_or_use_case", mode="after")
    @classmethod
    def _role_must_be_supported(cls, value: str | None) -> str | None:
        if value is None or value.strip() == "":
            return None
        if value not in ROLE_OPTIONS:
            raise InvalidRoleOrUseCaseError()
        return value

    @model_validator(mode="after")
    def _passwords_must_match(self) -> RegisterRequest:
        if self.password != self.confirm_password:
            raise PasswordsDoNotMatchError()
        return self

    @model_validator(mode="after")
    def _terms_must_be_accepted(self) -> RegisterRequest:
        if not self.accepted_terms:
            raise TermsNotAcceptedError()
        return self


class PendingSignup(BaseModel):
    """The `user` field of `RegisterResponse` — deliberately not `UserPublic`:
    no `users` row exists yet at this point (see `AuthService.register`),
    so there's no id/status/created_at to report. Only what the frontend
    needs to render "check your email"."""

    full_name: str
    email: str


class RegisterResponse(BaseModel):
    user: PendingSignup
    next_step: Literal["verify_email"] = "verify_email"
    message: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyEmailResponse(BaseModel):
    status: Literal["active"] = "active"
    message: str
    # The now-active user — verification is the moment an account is
    # created, and the frontend uses this to establish the session without
    # a separate login round-trip.
    user: UserPublic


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class GoogleSessionRequest(BaseModel):
    """The single-use ticket returned to the SPA after the Google OAuth
    callback (see `google_oauth.consume_oauth_ticket`)."""

    ticket: str = Field(min_length=1, max_length=200)


class LoginResponse(BaseModel):
    user: UserPublic
    message: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str
