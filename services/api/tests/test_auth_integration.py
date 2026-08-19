"""Full registration/verification round-trip against a real PostgreSQL +
Redis instance.

Skipped by default — set RUN_INTEGRATION_TESTS=1 and point DATABASE_URL /
REDIS_URL (see conftest.py's `_TEST_ENV`) at a disposable local
Postgres/PostGIS + Redis with migrations applied, e.g.:

    RUN_INTEGRATION_TESTS=1 pytest -m integration

Never point this at the shared `naksha_geosphere` database or the remote
storage server — it creates and deletes real rows.

`register` no longer writes a `users` row at all — the submitted data is
held in Redis (see `app/modules/authentication/pending_store.py`) until
`verify_email` is called, which is the only place a row is ever inserted.
These tests exercise that: nothing lands in Postgres until verification.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import uuid
from collections.abc import AsyncGenerator
from dataclasses import asdict, replace

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import get_settings
from app.database.session import get_engine, get_session_factory
from app.modules.authentication.email_otp import hash_code
from app.modules.authentication.google_oauth import GoogleUserInfo, save_oauth_ticket
from app.modules.authentication.pending_store import get_pending_registration
from app.modules.authentication.service import AuthService
from app.modules.users.models import User, UserStatus
from app.services.redis_client import get_redis_client

pytestmark = pytest.mark.integration

requires_integration = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION_TESTS") != "1",
    reason="set RUN_INTEGRATION_TESTS=1 to run against a live database",
)

TEST_CODE = "424242"


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
    """Deletes only the single row this test created — never a bulk delete."""
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is not None:
            await session.delete(user)
            await session.commit()


def _pending_key(email: str) -> str:
    """Mirrors `pending_store._key` — duplicated here rather than importing
    a private symbol across the test boundary."""
    return "pending_reg:" + hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]


async def _clear_pending(email: str) -> None:
    redis = get_redis_client()
    await redis.delete(_pending_key(email.strip().lower()))


async def _mint_valid_code_for(email: str) -> str:
    """Registration never returns the raw code to the caller (only queues
    it in an email) — for tests only, overwrite the pending record's
    `code_hash` with a known test code's hash (preserving the record's
    remaining TTL) so we can exercise verify without intercepting the
    queued email."""
    redis = get_redis_client()
    normalized = email.strip().lower()
    pending = await get_pending_registration(redis, normalized)
    assert pending is not None, "expected a pending registration for this email"

    key = _pending_key(normalized)
    ttl = await redis.ttl(key)
    updated = replace(pending, code_hash=hash_code(TEST_CODE), attempts=0)
    await redis.set(key, json.dumps(asdict(updated)), ex=max(ttl, 1))
    return TEST_CODE


@requires_integration
async def test_register_creates_no_user_row(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        response = await client.post("/api/v1/auth/register", json=payload)
        assert response.status_code == 201

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            assert result.scalars().all() == []
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_register_response_never_leaks_secrets(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        response = await client.post("/api/v1/auth/register", json=payload)
        body_text = response.text
        assert "password_hash" not in body_text
        assert "code_hash" not in body_text
        assert str(payload["password"]) not in body_text
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_full_verify_email_flow_persists_expected_fields(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        register_response = await client.post("/api/v1/auth/register", json=payload)
        assert register_response.status_code == 201

        code = await _mint_valid_code_for(str(payload["email"]))

        response = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": code}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "active"

        # Reusing the same code must now fail — the pending record was consumed.
        replay = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": code}
        )
        assert replay.status_code == 422
        assert replay.json()["error_code"] == "INVALID_OR_EXPIRED_CODE"

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            user = result.scalar_one()
            assert user.full_name == payload["full_name"]
            assert user.organization_name == payload["organization_name"]
            assert user.role_or_use_case == payload["role_or_use_case"]
            assert user.status == UserStatus.ACTIVE
            assert user.email_verified_at is not None
            assert user.terms_accepted_at is not None
            assert user.terms_version
            assert user.privacy_version
            assert user.password_hash.startswith("$argon2id$")
            assert user.password_hash != payload["password"]
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_duplicate_register_before_verification_supersedes_earlier_code(
    client: AsyncClient,
) -> None:
    """Nothing is in Postgres yet, so registering the same email twice
    before verifying isn't a conflict — it's a resubmission. The first
    code stops working; only the second is valid."""
    payload = _unique_payload()
    try:
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201

        first_code = await _mint_valid_code_for(str(payload["email"]))

        second = await client.post("/api/v1/auth/register", json=payload)
        assert second.status_code == 201

        # The first code (now superseded) must no longer verify.
        stale = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": first_code}
        )
        assert stale.status_code == 422
        assert stale.json()["error_code"] == "INVALID_OR_EXPIRED_CODE"

        second_code = await _mint_valid_code_for(str(payload["email"]))
        verify = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": second_code}
        )
        assert verify.status_code == 200
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_email_uniqueness_is_case_insensitive_once_verified(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        first = await client.post("/api/v1/auth/register", json=payload)
        assert first.status_code == 201
        code = await _mint_valid_code_for(str(payload["email"]))
        verify = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": code}
        )
        assert verify.status_code == 200

        second_payload = {**payload, "email": str(payload["email"]).upper()}
        second = await client.post("/api/v1/auth/register", json=second_payload)
        assert second.status_code == 409
        assert second.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_concurrent_verification_of_same_code_creates_one_user(client: AsyncClient) -> None:
    payload = _unique_payload()
    try:
        register_response = await client.post("/api/v1/auth/register", json=payload)
        assert register_response.status_code == 201
        code = await _mint_valid_code_for(str(payload["email"]))

        responses = await asyncio.gather(
            client.post("/api/v1/auth/verify-email", json={"email": payload["email"], "code": code}),
            client.post("/api/v1/auth/verify-email", json={"email": payload["email"], "code": code}),
        )
        statuses = sorted(r.status_code for r in responses)
        assert statuses == [200, 422]

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == payload["email"]))
            assert len(result.scalars().all()) == 1
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


@requires_integration
async def test_expired_or_unknown_code_is_rejected(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/verify-email",
        json={"email": f"never-registered-{uuid.uuid4().hex}@example.com", "code": "000000"},
    )
    assert response.status_code == 422
    assert response.json()["error_code"] == "INVALID_OR_EXPIRED_CODE"


@requires_integration
async def test_wrong_code_lockout_invalidates_after_max_attempts(client: AsyncClient) -> None:
    from app.core.config import get_settings

    payload = _unique_payload()
    try:
        register_response = await client.post("/api/v1/auth/register", json=payload)
        assert register_response.status_code == 201
        valid_code = await _mint_valid_code_for(str(payload["email"]))

        max_attempts = get_settings().email_otp_max_attempts
        for _ in range(max_attempts):
            wrong = await client.post(
                "/api/v1/auth/verify-email",
                json={"email": payload["email"], "code": "000000"},
            )
            assert wrong.status_code == 422

        # The code is now invalidated even though it was originally correct.
        locked_out = await client.post(
            "/api/v1/auth/verify-email", json={"email": payload["email"], "code": valid_code}
        )
        assert locked_out.status_code == 422
        assert locked_out.json()["error_code"] == "INVALID_OR_EXPIRED_CODE"
    finally:
        await _delete_user(str(payload["email"]))
        await _clear_pending(str(payload["email"]))


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
            await _clear_pending(email)


@requires_integration
async def test_google_signup_creates_active_user_and_reuses_it() -> None:
    email = f"google-{uuid.uuid4().hex[:10]}@example.com"
    try:
        session_factory = get_session_factory()
        redis = get_redis_client()
        info = GoogleUserInfo(email=email, name="Google User", sub="gsub-1", email_verified=True)

        async with session_factory() as session:
            service = AuthService(session=session, settings=get_settings(), redis=redis)
            first = await service.social_signup_or_login(email=info.email, name=info.name)
            assert first.status == UserStatus.ACTIVE
            assert first.email_verified_at is not None
            assert first.organization_name is None
            # OAuth accounts must not have a usable password.
            assert first.password_hash != "password"

            second = await service.social_signup_or_login(email=info.email, name=info.name)
            assert second.id == first.id

        session_factory = get_session_factory()
        async with session_factory() as session:
            result = await session.execute(select(User).where(User.email == email))
            assert result.scalars().all().__len__() == 1
    finally:
        await _delete_user(email)


@requires_integration
async def test_google_session_ticket_endpoint_round_trip(client: AsyncClient) -> None:
    email = f"google-sess-{uuid.uuid4().hex[:10]}@example.com"
    try:
        session_factory = get_session_factory()
        redis = get_redis_client()
        async with session_factory() as session:
            service = AuthService(session=session, settings=get_settings(), redis=redis)
            await service.social_signup_or_login(email=email, name="Session User")

        ticket = await save_oauth_ticket(redis, email=email, ttl_seconds=300)
        response = await client.post("/api/v1/auth/oauth/session", json={"ticket": ticket})
        assert response.status_code == 200
        assert response.json()["user"]["email"] == email

        # The ticket is single-use — replaying it must fail.
        replay = await client.post("/api/v1/auth/oauth/session", json={"ticket": ticket})
        assert replay.status_code == 401
        assert replay.json()["error_code"] == "GOOGLE_SESSION_INVALID"
    finally:
        await _delete_user(email)


@pytest.fixture(autouse=True)
async def _dispose_engine_between_tests() -> AsyncGenerator[None, None]:
    yield
    await get_engine().dispose()
