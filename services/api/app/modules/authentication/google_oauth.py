"""Google OAuth (Sign in with Google) helpers.

Implements the authorization-code flow with PKCE. The browser is sent to
Google's authorize endpoint (URL built by the frontend); Google redirects
back to the backend's `/auth/google/callback` with a one-time `code` and
the echoed `state` (which carries the PKCE verifier). This module exchanges
that code for tokens using the client secret, fetches the verified
userinfo, and hands a `GoogleUserInfo` to `AuthService`.

The frontend session model is client-side (sessionStorage), so the
callback cannot just set a cookie: it issues a short-lived, single-use
Redis "ticket" (see `oauth_tickets.py`) and redirects the browser back to
the SPA with `?oauth_session=<ticket>`, which the SPA exchanges for the
user via `POST /auth/oauth/session`.

Never log a token, code, or the raw userinfo payload.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.modules.authentication.exceptions import EmailNotVerifiedError, GoogleAuthError
from app.modules.authentication.oauth_tickets import (
    consume_oauth_ticket,  # noqa: F401 — re-exported for existing callers
    save_oauth_ticket,  # noqa: F401 — re-exported for existing callers
)

_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass(frozen=True)
class GoogleUserInfo:
    email: str
    name: str
    sub: str
    email_verified: bool


def _decode_jwt_payload(token: str) -> dict[str, object] | None:
    """Decodes the payload of an (unsigned) JWT. Used only defensively — the
    ID token arrives from Google's token endpoint over TLS bound to this
    client's secret + code, so signature verification via JWKS is not
    required for the audience check below."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


async def exchange_google_code(
    *,
    code: str,
    code_verifier: str,
    settings: Settings,
) -> GoogleUserInfo:
    """Exchanges the one-time authorization code for user info.

    Raises `GoogleAuthError` when Google's endpoints fail or the account's
    email is missing, and `EmailNotVerifiedError` when the Google account's
    email is not verified (we never auto-create accounts on unverified
    emails).
    """
    if not (
        settings.google_client_id
        and settings.google_client_secret
        and settings.google_redirect_uri
    ):
        raise GoogleAuthError()

    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            _TOKEN_ENDPOINT,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.google_redirect_uri,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code_verifier": code_verifier,
            },
        )
        if token_response.status_code != 200:
            raise GoogleAuthError()
        token_body = token_response.json()

        access_token = token_body.get("access_token")
        if not access_token:
            raise GoogleAuthError()

        claims = _decode_jwt_payload(token_body.get("id_token") or "")
        if claims is not None and claims.get("aud") != settings.google_client_id:
            raise GoogleAuthError()

        userinfo_response = await client.get(
            _USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_response.status_code != 200:
            raise GoogleAuthError()
        info = userinfo_response.json()

    email = (info.get("email") or "").strip().lower()
    name = (info.get("name") or "").strip()
    if not email or not info.get("email_verified"):
        raise EmailNotVerifiedError()
    return GoogleUserInfo(
        email=email,
        name=name,
        sub=str(info.get("sub", "")),
        email_verified=bool(info.get("email_verified")),
    )


def parse_google_state(state: str | None) -> tuple[str, str]:
    """Splits the echoed OAuth `state` into `(code_verifier, route)`.

    The frontend builds `state` as `<csrf>.<pkce_verifier>.<route>` where
    `route` is `signin` or `signup` — the backend uses it to redirect the
    browser back to the right page after the exchange. Unknown/empty
    routes come back as `""` and the caller falls back to `/signup`.
    """
    if not state:
        return "", ""
    parts = state.split(".")
    verifier = parts[1] if len(parts) >= 2 else ""
    route = parts[2] if len(parts) >= 3 else ""
    return verifier, route
