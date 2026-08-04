"""Email-verification token generation and hashing.

Only the SHA-256 hash of a verification token is ever persisted. The raw
token exists only long enough to be embedded in the verification email
link — it must never be logged or stored.
"""

from __future__ import annotations

import hashlib
import secrets

TOKEN_BYTES = 32


def generate_verification_token() -> tuple[str, str]:
    """Returns (raw_token, token_hash). Send `raw_token` to the user;
    persist only `token_hash`."""
    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    return raw_token, hash_token(raw_token)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
