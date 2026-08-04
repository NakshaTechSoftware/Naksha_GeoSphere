"""POST /api/v1/auth/register — request validation and error-shape tests
that don't require a live database (the test environment's DATABASE_URL,
set in conftest.py, points at nothing reachable). Full round-trip tests
(201 creation, duplicate email, etc.) live in test_auth_integration.py,
gated behind a live Postgres/Redis."""

from __future__ import annotations

from httpx import AsyncClient

VALID_PAYLOAD = {
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "organization_name": "Example Org",
    "role_or_use_case": "developer",
    "password": "a-strong-password-123",
    "confirm_password": "a-strong-password-123",
    "accepted_terms": True,
}


async def test_missing_fields_return_structured_validation_error(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/register", json={})
    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "VALIDATION_ERROR"
    assert "fields" in body
    assert "full_name" in body["fields"]


async def test_password_mismatch_returns_structured_error(client: AsyncClient) -> None:
    payload = {**VALID_PAYLOAD, "confirm_password": "a-totally-different-pass-1"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "PASSWORDS_DO_NOT_MATCH"


async def test_terms_not_accepted_returns_structured_error(client: AsyncClient) -> None:
    payload = {**VALID_PAYLOAD, "accepted_terms": False}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "TERMS_NOT_ACCEPTED"


async def test_invalid_role_returns_structured_error(client: AsyncClient) -> None:
    payload = {**VALID_PAYLOAD, "role_or_use_case": "astronaut"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "INVALID_ROLE_OR_USE_CASE"


async def test_invalid_email_returns_validation_error(client: AsyncClient) -> None:
    payload = {**VALID_PAYLOAD, "email": "not-an-email"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"


async def test_short_password_returns_validation_error(client: AsyncClient) -> None:
    payload = {**VALID_PAYLOAD, "password": "short1", "confirm_password": "short1"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422
    assert response.json()["error_code"] == "VALIDATION_ERROR"


async def test_valid_payload_with_unreachable_database_returns_503(client: AsyncClient) -> None:
    """A structurally valid payload still can't create a user without a
    reachable database — proves the readiness check runs before any
    write, and that failure surfaces as a clean 503 rather than a stack
    trace or a partial write."""
    response = await client.post("/api/v1/auth/register", json=VALID_PAYLOAD)
    assert response.status_code == 503
    body = response.json()
    assert body["error_code"] == "DATABASE_UNAVAILABLE"
    assert "password" not in str(body)
