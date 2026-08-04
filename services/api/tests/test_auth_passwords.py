"""Password hashing must be Argon2id, never reversible, never plaintext."""

from __future__ import annotations

from app.modules.authentication.passwords import hash_password, needs_rehash, verify_password


def test_hash_is_argon2id() -> None:
    password_hash = hash_password("a-sufficiently-long-password-1")
    assert password_hash.startswith("$argon2id$")


def test_hash_never_equals_plaintext() -> None:
    password = "a-sufficiently-long-password-1"
    assert hash_password(password) != password


def test_hash_is_salted_and_nondeterministic() -> None:
    password = "a-sufficiently-long-password-1"
    assert hash_password(password) != hash_password(password)


def test_verify_password_succeeds_for_correct_password() -> None:
    password = "a-sufficiently-long-password-1"
    password_hash = hash_password(password)
    assert verify_password(password, password_hash) is True


def test_verify_password_fails_for_incorrect_password() -> None:
    password_hash = hash_password("a-sufficiently-long-password-1")
    assert verify_password("a-different-password-12345", password_hash) is False


def test_needs_rehash_false_for_current_parameters() -> None:
    password_hash = hash_password("a-sufficiently-long-password-1")
    assert needs_rehash(password_hash) is False
