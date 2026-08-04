"""Full registration/verification round-trip against a real PostgreSQL +
Redis instance.

Skipped by default — set RUN_INTEGRATION_TESTS=1 and point DATABASE_URL /
REDIS_URL (see conftest.py's `_TEST_ENV`) at a disposable local
Postgres/PostGIS + Redis with migrations applied, e.g.:

    RUN_INTEGRATION_TESTS=1 pytest -m integration

Never point this at the shared `naksha_geosphere` database or the remote
storage server — it creates and deletes real rows.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text

from app.database.session import get_engine, get_session_factory
from app.modules.authentication.models import EmailVerificationToken
from app.modules.authentication.tokens import hash_token
from app.modules.users.models import User, UserStatus

pytestmark = pytest.mark.integration

requires_integration = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION_TESTS") != "1",
    reason="set RUN_INTEGRATION_TESTS=1 to run against a live database",
)


def _unique_payload() -> dict[str, object]:
    unique = uuid.uuid4().hex[:12]
    return {
        "full_name": "Integration Test User",
        "email": f"integration-{unique}@example.com",
        "organization_name": "Integration Test Org",
        "role_or_use_case": "developer",
        "password": "a-strong-password-123",
        "confirm_password": "a-strong-password-123",
        "accepted_terms": True,
    }


async def _delete_user(email: str) -> None:
    """Deletes only the single row this test created — never a bulk
    delete, and never anything outside `email_verification_tokens`
    rows owned by that user (cascade handles those)."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is not None:
            await session.delete(user)
            await session.commit()


@requires_integration
async def test_register_creates_exactly_one_user_row(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 201

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            rows = result.scalars().all()
            assert len(rows) == 1
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_register_response_never_leaks_secrets(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        response = await client.post("/api/v1/auth/register", json=payload)
        body_text = response.text
        assert "password_hash" not in body_text
        assert "token_hash" not in body_text
        assert str(payload["password"]) not in body_text
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_register_persists_expected_fields(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        await client.post("/api/v1/auth/register", json=payload)

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            user = result.scalar_one()

            assert user.full_name == payload["full_name"]
            assert user.organization_name == payload["organization_name"]
            assert user.role_or_use_case == payload["role_or_use_case"]
            assert user.status == UserStatus.PENDING_VERIFICATION
            assert user.email_verified_at is None
            assert user.terms_accepted_at is not None
            assert user.terms_version
            assert user.privacy_version
            assert user.password_hash.startswith("$argon2id$")
            assert user.password_hash != payload["password"]
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_email_uniqueness_is_case_insensitive(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        second_payload = {**payload, "email": str(payload["email"]).upper()}
        second = await client.post("/api/v1/auth/register", json=second_payload)
        assert second.status_code == 409
        assert second.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_concurrent_duplicate_registration_creates_one_user(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        responses = await asyncio.gather(
            client.post("/api/v1/auth/register", json=payload),
            client.post("/api/v1/auth/register", json=payload),
        )
        statuses = sorted(r.status_code for r in responses)
        assert statuses == [201, 409]

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            assert len(result.scalars().all()) == 1
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_verification_token_stores_only_hash(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        await client.post("/api/v1/auth/register", json=payload)

        session_factory = get_session_factory()
        async with session_factory() as session:
            user_result = await session.execute(select(User).where(User.email == payload["email"]))
            user = user_result.scalar_one()
            token_result = await session.execute(
                select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
            )
            token = token_result.scalar_one()
            assert len(token.token_hash) == 64
            assert token.consumed_at is None
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_full_verify_email_flow(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        await client.post("/api/v1/auth/register", json=payload)

        session_factory = get_session_factory()
        async with session_factory() as session:
            user_result = await session.execute(select(User).where(User.email == payload["email"]))
            user = user_result.scalar_one()
            token_result = await session.execute(
                select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
            )
            token_row = token_result.scalar_one()

        # The raw token was never persisted or returned by the API — for
        # this test only, we mint a fresh raw token and overwrite the
        # stored hash to match it, so we can exercise the verify flow
        # without needing to intercept the queued email.
        raw_token = f"test-only-{uuid.uuid4().hex}"
        async with session_factory() as session:
            await session.execute(
                text("UPDATE email_verification_tokens SET token_hash = :hash WHERE id = :id"),
                {"hash": hash_token(raw_token), "id": token_row.id},
            )
            await session.commit()

        response = await client.post("/api/v1/auth/verify-email", json={"token": raw_token})
        assert response.status_code == 200
        assert response.json()["status"] == "active"

        # Reusing the same token must now fail.
        replay = await client.post("/api/v1/auth/verify-email", json={"token": raw_token})
        assert replay.status_code == 422
        assert replay.json()["error_code"] == "INVALID_OR_EXPIRED_TOKEN"

        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            user = result.scalar_one()
            assert user.status == UserStatus.ACTIVE
            assert user.email_verified_at is not None
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_expired_token_is_rejected(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        await client.post("/api/v1/auth/register", json=payload)

        session_factory = get_session_factory()
        async with session_factory() as session:
            user_result = await session.execute(select(User).where(User.email == payload["email"]))
            user = user_result.scalar_one()
            token_result = await session.execute(
                select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
            )
            token_row = token_result.scalar_one()

        raw_token = f"test-only-{uuid.uuid4().hex}"
        async with session_factory() as session:
            await session.execute(
                text(
                    "UPDATE email_verification_tokens "
                    "SET token_hash = :hash, expires_at = now() - interval '1 hour' "
                    "WHERE id = :id"
                ),
                {"hash": hash_token(raw_token), "id": token_row.id},
            )
            await session.commit()

        response = await client.post("/api/v1/auth/verify-email", json={"token": raw_token})
        assert response.status_code == 422
        assert response.json()["error_code"] == "INVALID_OR_EXPIRED_TOKEN"
    finally:
        await _delete_user(str(payload["email"]))


@requires_integration
async def test_registration_rate_limit_blocks_excess_attempts(client: AsyncClient) -> None:
    emails_to_clean: list[str] = []
    try:
        responses = []
        for _ in range(7):
            payload = _unique_payload()
            emails_to_clean.append(str(payload["email"]))
            responses.append(await client.post("/api/v1/auth/register", json=payload))

        assert any(r.status_code == 429 for r in responses)
        limited = next(r for r in responses if r.status_code == 429)
        assert limited.json()["error_code"] == "REGISTRATION_RATE_LIMITED"
    finally:
        for email in emails_to_clean:
            await _delete_user(email)


@pytest.fixture(autouse=True)
async def _dispose_engine_between_tests() -> AsyncGenerator[None, None]:
    yield
    await get_engine().dispose()
