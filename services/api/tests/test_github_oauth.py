"""`github_oauth` logic — code exchange (httpx mocked) and state parsing."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import Settings
from app.modules.authentication.exceptions import GitHubAuthError, GitHubEmailMissingError
from app.modules.authentication.github_oauth import (
    _pick_email,
    exchange_github_code,
    parse_github_state,
)

SETTINGS = Settings(
    secret_key="test-secret",
    github_client_id="Iv1.testid",
    github_client_secret="test-secret",
    github_redirect_uri="http://localhost:8000/api/v1/auth/github/callback",
)


class FakeResponse:
    def __init__(self, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


class FakeHttpClient:
    def __init__(self, token: FakeResponse, user: FakeResponse, emails: FakeResponse) -> None:
        self._token = token
        self._user = user
        self._emails = emails
        self.last_post_data: dict[str, object] | None = None
        self.last_headers: dict[str, str] | None = None

    async def __aenter__(self) -> "FakeHttpClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def post(self, url: str, data: dict[str, object], headers: dict[str, str]) -> FakeResponse:
        self.last_post_data = data
        return self._token

    async def get(self, url: str, headers: dict[str, str]) -> FakeResponse:
        self.last_headers = headers
        return self._user if url.endswith("/user") else self._emails


def _patch_httpx(monkeypatch: pytest.MonkeyPatch, fake: FakeHttpClient) -> None:
    def _factory(*args: object, **kwargs: object) -> FakeHttpClient:
        return fake

    monkeypatch.setattr(httpx, "AsyncClient", _factory)


def _emails(*emails: dict[str, object]) -> FakeResponse:
    return FakeResponse(200, list(emails))


async def test_exchange_github_code_uses_primary_verified_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeHttpClient(
        FakeResponse(200, {"access_token": "gho-at-1"}),
        FakeResponse(200, {"login": "octocat", "name": "The Octocat", "email": None}),
        _emails(
            {"email": "secondary@example.com", "primary": False, "verified": True},
            {"email": "octo@example.com", "primary": True, "verified": True},
        ),
    )
    _patch_httpx(monkeypatch, fake)

    info = await exchange_github_code(code="code-1", settings=SETTINGS)

    assert info.email == "octo@example.com"
    assert info.name == "The Octocat"
    assert info.login == "octocat"
    assert fake.last_post_data is not None
    assert fake.last_post_data["client_secret"] == "test-secret"
    assert fake.last_post_data["code"] == "code-1"
    assert fake.last_post_data["redirect_uri"] == SETTINGS.github_redirect_uri
    assert fake.last_headers == {
        "Authorization": "Bearer gho-at-1",
        "Accept": "application/vnd.github+json",
    }


async def test_exchange_falls_back_to_profile_email_without_emails_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeHttpClient(
        FakeResponse(200, {"access_token": "gho-at-1"}),
        FakeResponse(200, {"login": "octocat", "name": "Octocat", "email": "public@example.com"}),
        FakeResponse(404, {}),
    )
    _patch_httpx(monkeypatch, fake)

    info = await exchange_github_code(code="code-1", settings=SETTINGS)
    assert info.email == "public@example.com"
    assert info.name == "Octocat"


async def test_exchange_uses_login_when_name_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        FakeResponse(200, {"access_token": "gho-at-1"}),
        FakeResponse(200, {"login": "octocat", "name": None, "email": "x@example.com"}),
        _emails({"email": "x@example.com", "primary": True, "verified": True}),
    )
    _patch_httpx(monkeypatch, fake)

    info = await exchange_github_code(code="code-1", settings=SETTINGS)
    assert info.name == "octocat"


async def test_exchange_raises_when_no_verified_email(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        FakeResponse(200, {"access_token": "gho-at-1"}),
        FakeResponse(200, {"login": "octocat", "name": "Octocat", "email": None}),
        _emails(
            {"email": "unverified@example.com", "primary": True, "verified": False},
        ),
    )
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(GitHubEmailMissingError):
        await exchange_github_code(code="code-1", settings=SETTINGS)


async def test_exchange_rejects_failed_token_request(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(FakeResponse(400, {"error": "bad_verification_code"}), FakeResponse(200, {}), FakeResponse(200, []))
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(GitHubAuthError):
        await exchange_github_code(code="code-1", settings=SETTINGS)


async def test_exchange_rejects_failed_user_request(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttpClient(
        FakeResponse(200, {"access_token": "gho-at-1"}),
        FakeResponse(401, {"message": "Bad credentials"}),
        FakeResponse(200, []),
    )
    _patch_httpx(monkeypatch, fake)

    with pytest.raises(GitHubAuthError):
        await exchange_github_code(code="code-1", settings=SETTINGS)


async def test_exchange_raises_when_github_is_unconfigured() -> None:
    unconfigured = Settings(secret_key="x")
    with pytest.raises(GitHubAuthError):
        await exchange_github_code(code="c", settings=unconfigured)


def test_parse_github_state_extracts_route() -> None:
    assert parse_github_state("csrf-token.signin") == "signin"
    assert parse_github_state("csrf-token.signup") == "signup"


def test_parse_github_state_handles_missing_state() -> None:
    assert parse_github_state(None) == ""
    assert parse_github_state("") == ""


def test_pick_email_prefers_primary_verified() -> None:
    emails = [
        {"email": "a@example.com", "primary": False, "verified": True},
        {"email": "b@example.com", "primary": True, "verified": True},
    ]
    assert _pick_email(emails) == "b@example.com"


def test_pick_email_returns_empty_when_none_verified() -> None:
    emails = [{"email": "a@example.com", "primary": True, "verified": False}]
    assert _pick_email(emails) == ""
