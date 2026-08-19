"""`RegisterRequest` validation — the backend must enforce these rules
itself even though the frontend already validates them."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.modules.authentication.exceptions import (
    InvalidRoleOrUseCaseError,
    PasswordsDoNotMatchError,
    TermsNotAcceptedError,
)
from app.modules.authentication.schemas import RegisterRequest

VALID_PAYLOAD: dict[str, Any] = {
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "organization_name": "Example Org",
    "role_or_use_case": "developer",
    "password": "a-strong-password-123",
    "confirm_password": "a-strong-password-123",
    "accepted_terms": True,
}


def test_valid_payload_is_accepted() -> None:
    request = RegisterRequest.model_validate(VALID_PAYLOAD)
    assert request.full_name == "Ada Lovelace"
    assert request.role_or_use_case == "developer"


def test_full_name_is_trimmed() -> None:
    request = RegisterRequest.model_validate({**VALID_PAYLOAD, "full_name": "  Ada Lovelace  "})
    assert request.full_name == "Ada Lovelace"


def test_blank_full_name_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate({**VALID_PAYLOAD, "full_name": "   "})


def test_blank_organization_normalizes_to_none() -> None:
    request = RegisterRequest.model_validate({**VALID_PAYLOAD, "organization_name": "   "})
    assert request.organization_name is None


def test_omitted_organization_and_role_are_accepted() -> None:
    payload = {
        k: v for k, v in VALID_PAYLOAD.items() if k not in ("organization_name", "role_or_use_case")
    }
    request = RegisterRequest.model_validate(payload)
    assert request.organization_name is None
    assert request.role_or_use_case is None


def test_invalid_email_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate({**VALID_PAYLOAD, "email": "not-an-email"})


def test_unsupported_role_is_rejected() -> None:
    with pytest.raises(InvalidRoleOrUseCaseError):
        RegisterRequest.model_validate({**VALID_PAYLOAD, "role_or_use_case": "astronaut"})


def test_short_password_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest.model_validate(
            {**VALID_PAYLOAD, "password": "short1", "confirm_password": "short1"}
        )


def test_mismatched_passwords_are_rejected() -> None:
    with pytest.raises(PasswordsDoNotMatchError):
        RegisterRequest.model_validate(
            {**VALID_PAYLOAD, "confirm_password": "a-different-password-1"}
        )


def test_unaccepted_terms_are_rejected() -> None:
    with pytest.raises(TermsNotAcceptedError):
        RegisterRequest.model_validate({**VALID_PAYLOAD, "accepted_terms": False})


def test_password_is_not_trimmed() -> None:
    padded = "  a-strong-password-123  "
    request = RegisterRequest.model_validate(
        {**VALID_PAYLOAD, "password": padded, "confirm_password": padded}
    )
    assert request.password == padded
