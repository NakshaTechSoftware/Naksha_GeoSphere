"""Email-verification OTP codes: only the SHA-256 hash is ever meant to be
stored."""

from __future__ import annotations

import hashlib
import re

from app.modules.authentication.email_otp import generate_email_otp, hash_code

_SIX_DIGITS = re.compile(r"^\d{6}$")


def test_generate_email_otp_returns_six_digit_raw_code() -> None:
    raw_code, _ = generate_email_otp()
    assert _SIX_DIGITS.match(raw_code)


def test_generate_email_otp_returns_matching_hash() -> None:
    raw_code, code_hash = generate_email_otp()
    assert code_hash == hashlib.sha256(raw_code.encode("utf-8")).hexdigest()


def test_generated_codes_are_not_always_the_same() -> None:
    codes = {generate_email_otp()[0] for _ in range(20)}
    assert len(codes) > 1


def test_code_hash_is_64_char_hex() -> None:
    _, code_hash = generate_email_otp()
    assert len(code_hash) == 64
    int(code_hash, 16)  # raises ValueError if not valid hex


def test_hash_code_is_deterministic() -> None:
    raw_code = "123456"
    assert hash_code(raw_code) == hash_code(raw_code)


def test_hash_code_matches_manual_sha256() -> None:
    raw_code = "123456"
    assert hash_code(raw_code) == hashlib.sha256(raw_code.encode("utf-8")).hexdigest()
