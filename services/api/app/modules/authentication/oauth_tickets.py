"""Shared single-use Redis sign-in tickets for OAuth providers.

After an OAuth callback (Google, GitHub, …) creates or signs in a user,
the callback issues a short-lived single-use ticket and redirects the
browser back to the SPA; the SPA swaps the ticket for the user via
`POST /auth/oauth/session`.
"""

from __future__ import annotations

import secrets

from redis.asyncio import Redis

_TICKET_PREFIX = "oauth_ticket:"


async def save_oauth_ticket(redis: Redis, *, email: str, ttl_seconds: int) -> str:
    """Stores a single-use sign-in ticket mapping back to the user's email."""
    token = secrets.token_urlsafe(32)
    await redis.set(_TICKET_PREFIX + token, email, ex=ttl_seconds)
    return token


async def consume_oauth_ticket(redis: Redis, token: str) -> str | None:
    """Returns the ticket's email and deletes the ticket (single-use), or
    `None` when the ticket is unknown/expired/already consumed."""
    key = _TICKET_PREFIX + token
    email = await redis.get(key)
    if email is None:
        return None
    await redis.delete(key)
    return email if isinstance(email, str) else email.decode("utf-8")
