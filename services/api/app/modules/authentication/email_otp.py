"""Email-verification OTP generation and hashing.

Only the SHA-256 hash of a code is ever persisted. The raw code exists
only long enough to be emailed to the user — it must never be logged or
stored.
"""

from __future__ import annotations

import hashlib
import secrets

CODE_DIGITS = 6


def generate_email_otp() -> tuple[str, str]:
    """Returns (raw_code, code_hash). Send `raw_code` to the user;
    persist only `code_hash`."""
    raw_code = f"{secrets.randbelow(10**CODE_DIGITS):0{CODE_DIGITS}d}"
    return raw_code, hash_code(raw_code)


def hash_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
