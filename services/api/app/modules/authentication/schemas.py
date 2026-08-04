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
    organization_name: str = Field(min_length=1, max_length=200)
    role_or_use_case: str
    # Passwords are never trimmed or otherwise modified — a leading/
    # trailing space is significant and must round-trip exactly.
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)
    confirm_password: str
    accepted_terms: bool

    @field_validator("full_name", "organization_name", mode="after")
    @classmethod
    def _trim_and_require_non_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("must not be blank")
        return trimmed

    @field_validator("role_or_use_case", mode="after")
    @classmethod
    def _role_must_be_supported(cls, value: str) -> str:
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


class RegisterResponse(BaseModel):
    user: UserPublic
    next_step: Literal["verify_email"] = "verify_email"
    message: str


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=1)


class VerifyEmailResponse(BaseModel):
    status: Literal["active"] = "active"
    message: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResendVerificationResponse(BaseModel):
    message: str
