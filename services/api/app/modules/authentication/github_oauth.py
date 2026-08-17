"""GitHub OAuth (Sign in with GitHub) helpers.

GitHub's OAuth Apps use the plain authorization-code flow with the client
secret (no PKCE). The browser is sent to GitHub's authorize endpoint (URL
built by the frontend); GitHub redirects back to the backend's
`/auth/github/callback` with a one-time `code` and the echoed `state`
(which carries the return route). This module exchanges the code for an
access token, fetches the profile and verified email addresses, and hands a
`GitHubUserInfo` to `AuthService`.

Never log a token, code, or the raw profile payload.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.modules.authentication.exceptions import GitHubAuthError, GitHubEmailMissingError

_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token"
_USER_ENDPOINT = "https://api.github.com/user"
_EMAILS_ENDPOINT = "https://api.github.com/user/emails"

# `user:email` lets us read the user's verified email addresses — GitHub
# otherwise hides emails from OAuth apps by default.
SCOPES = "user:email"


@dataclass(frozen=True)
class GitHubUserInfo:
    email: str
    name: str
    login: str


def parse_github_state(state: str | None) -> str:
    """Returns the return route (`signin`/`signup`) from the echoed state.

    The frontend builds GitHub's `state` as `<csrf>.<route>` (GitHub apps
    don't use PKCE, so there's no verifier segment). Unknown/empty routes
    come back as `""` and the caller falls back to `/signup`.
    """
    if not state:
        return ""
    parts = state.split(".")
    return parts[1] if len(parts) >= 2 else ""


def _pick_email(emails: list[dict[str, object]]) -> str:
    """Prefers the primary verified email, then any verified one."""
    verified = [
        str(item.get("email", "")).strip().lower()
        for item in emails
        if item.get("email") and item.get("verified")
    ]
    if not verified:
        return ""
    for item in emails:
        if item.get("primary") and item.get("verified") and item.get("email"):
            return str(item["email"]).strip().lower()
    return verified[0]


async def exchange_github_code(*, code: str, settings: Settings) -> GitHubUserInfo:
    """Exchanges the one-time authorization code for the user's profile.

    Raises `GitHubAuthError` when GitHub's endpoints fail or credentials
    are unconfigured, and `GitHubEmailMissingError` when the account has no
    verified email to create an account with.
    """
    if not (settings.github_client_id and settings.github_client_secret and settings.github_redirect_uri):
        raise GitHubAuthError()

    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            _TOKEN_ENDPOINT,
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_response.status_code != 200:
            raise GitHubAuthError()
        token_body = token_response.json()

        access_token = token_body.get("access_token")
        if not access_token:
            raise GitHubAuthError()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }
        user_response = await client.get(_USER_ENDPOINT, headers=headers)
        if user_response.status_code != 200:
            raise GitHubAuthError()
        profile = user_response.json()

        emails_response = await client.get(_EMAILS_ENDPOINT, headers=headers)
        emails: list[dict[str, object]] = []
        if emails_response.status_code == 200:
            emails = emails_response.json()

    email = _pick_email(emails) if emails else (profile.get("email") or "").strip().lower()
    if not email:
        raise GitHubEmailMissingError()
    return GitHubUserInfo(
        email=email,
        name=(profile.get("name") or "").strip() or str(profile.get("login", "")),
        login=str(profile.get("login", "")),
    )
