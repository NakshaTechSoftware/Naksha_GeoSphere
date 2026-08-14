"""`google_oauth` logic — code exchange (httpx mocked) and the single-use
Redis sign-in tickets (in-memory fake Redis)."""

from __future__ import annotations

import json
from typing import cast

import httpx
import pytest
from redis.asyncio import Redis

from app.core.config import Settings
from app.modules.authentication.exceptions import EmailNotVerifiedError, GoogleAuthError
from app.modules.authentication.google_oauth import (
    consume_oauth_ticket,
    exchange_google_code,
    parse_google_state,
    save_oauth_ticket,
)

SETTINGS = Settings(
    secret_key="test-secret",
    google_client_id="test-id.apps.googleusercontent.com",
    google_client_secret="test-secret",
    google_redirect_uri="http://localhost:8000/api/v1/auth/google/callback",
)


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, object]) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict[str, object]:
        return self._payload


class FakeHttpClient:
    """Records the last POST/GET and returns canned responses."""

    def __init__(
        self, token_status: int, token_payload: dict[str, object], userinfo_payload: dict[str, object]
    ) -> None:
        self._token = FakeResponse(token_status, token_payload)
        self._userinfo = FakeResponse(200, userinfo_payload)
        self.last_post_data: dict[str, object] | None = None
        self.last_headers: dict[str, str] | None = None

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def post(self, url: str, data: dict[str, object]) -> FakeResponse:
        self.last_post_data = data
        return self._token

    async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
        self.last_headers = headers
        return self._userinfo


def _id_token(aud: str = "test-id.apps.googleusercontent.com") -> str:
    header = "e30"
    payload = (
        __import__("base64")
        .urlsafe_b64encode(json.dumps({"aud": aud, "sub": "1"}).encode())
        .decode()
        .rstrip("=")
    )
    return f"{header}.{payload}.sig"


def _patch_httpx(monkeypatch: pytest.MonkeyPatch, fake: FakeHttpClient) -> None:
    def _factory(*args: object, **kwargs: object) -> FakeHttpClient:
        return fake

    monkeypatch.setattr(httpx, "AsyncClient", _factory)


async def test_exchange_google_code_returns_verified_userinfo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeHttpClient(
        200,
        {"access_token": "at-1", "id_token": _id_token()},
        {"email": "ada@example.com", "email_verified": True, "name": "Ada Lovelace", "sub": "s1"},
    )
    _patch_httpx(monkeypatch, fake)

    info = await exchange_google_code(code="code-1", code_verifier="verifier-1", settings=SETTINGS)

    assert info.email == "ada@example.com"
    assert info.name == "Ada Lovelace"
    assert info.email_verified is True
    assert fake.last_post_data is not None
    assert fake.last_post_data["client_secret"] == "test-secret"
    assert fake.last_post_data["code_verifier"] == "verifier-1"
    assert fake.last_post_data["redirect_uri"] == SETTINGS.google_redirect_uri
    assert fake.last_headers == {"Authorization": "Bearer at-1"}


async def test_exchange_rejects_unverified_google_email(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        200,
        {"access_token": "at-1", "id_token": _id_token()},
        {"email": "ada@example.com", "email_verified": False, "name": "Ada"},
    )
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(EmailNotVerifiedError):
        await exchange_google_code(code="code-1", code_verifier="v", settings=SETTINGS)


async def test_exchange_rejects_missing_email(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        200,
        {"access_token": "at-1", "id_token": _id_token()},
        {"email": "", "email_verified": True},
    )
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(EmailNotVerifiedError):
        await exchange_google_code(code="code-1", code_verifier="v", settings=SETTINGS)


async def test_exchange_rejects_failed_token_request(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(400, {"error": "invalid_grant"}, {})
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(GoogleAuthError):
        await exchange_google_code(code="code-1", code_verifier="v", settings=SETTINGS)


async def test_exchange_rejects_wrong_audience(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        200,
        {"access_token": "at-1", "id_token": _id_token(aud="someone-elses.apps.googleusercontent.com")},
        {"email": "ada@example.com", "email_verified": True},
    )
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(GoogleAuthError):
        await exchange_google_code(code="code-1", code_verifier="v", settings=SETTINGS)


async def test_exchange_raises_when_google_is_unconfigured() -> None:
    unconfigured = Settings(secret_key="x")
    with pytest.raises(GoogleAuthError):
        await exchange_google_code(code="c", code_verifier="v", settings=unconfigured)


class FakeRedis:
    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> bool:
        self._values[key] = value
        return True

    async def get(self, key: str) -> str | None:
        return self._values.get(key)

    async def delete(self, key: str) -> int:
        return 1 if self._values.pop(key, None) is not None else 0


def _fake_redis() -> Redis:
    return cast(Redis, FakeRedis())


async def test_ticket_round_trip_and_single_use() -> None:
    redis = _fake_redis()
    token = await save_oauth_ticket(redis, email="ada@example.com", ttl_seconds=300)
    assert token

    assert await consume_oauth_ticket(redis, token) == "ada@example.com"
    # Second consume — already used — must return None.
    assert await consume_oauth_ticket(redis, token) is None


async def test_consume_unknown_ticket_returns_none() -> None:
    redis = _fake_redis()
    assert await consume_oauth_ticket(redis, "never-issued") is None


def test_parse_google_state_extracts_verifier_and_route() -> None:
    verifier, route = parse_google_state("csrf-token.verifier-123.signin")
    assert verifier == "verifier-123"
    assert route == "signin"


def test_parse_google_state_defaults_to_signup_route() -> None:
    verifier, route = parse_google_state("csrf-token.verifier-123")
    assert verifier == "verifier-123"
    assert route == ""


def test_parse_google_state_handles_missing_or_malformed_state() -> None:
    assert parse_google_state(None) == ("", "")
    assert parse_google_state("") == ("", "")
