"""Argon2id password hashing.

The only place in the codebase allowed to hash or verify a password.
Never log a raw password or a hash value.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Returns an Argon2id hash (e.g. `$argon2id$...`)."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verification against a stored Argon2id hash."""
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash was produced with weaker-than-current
    parameters and should be regenerated on next successful login."""
    return _hasher.check_needs_rehash(password_hash)
