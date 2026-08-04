"""Verification tokens: only the SHA-256 hash is ever meant to be stored."""

from __future__ import annotations

import hashlib

from app.modules.authentication.tokens import generate_verification_token, hash_token


def test_generate_verification_token_returns_raw_and_hash() -> None:
    raw_token, token_hash = generate_verification_token()
    assert raw_token
    assert token_hash == hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def test_generated_tokens_are_unique() -> None:
    first_raw, _ = generate_verification_token()
    second_raw, _ = generate_verification_token()
    assert first_raw != second_raw


def test_token_hash_is_64_char_hex() -> None:
    _, token_hash = generate_verification_token()
    assert len(token_hash) == 64
    int(token_hash, 16)  # raises ValueError if not valid hex


def test_hash_token_is_deterministic() -> None:
    raw_token = "example-raw-token"
    assert hash_token(raw_token) == hash_token(raw_token)


def test_hash_token_matches_manual_sha256() -> None:
    raw_token = "example-raw-token"
    assert hash_token(raw_token) == hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
