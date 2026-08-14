"""Registration and email-verification business logic.

`register` never writes to the `users` table: rate limits, a database
readiness check, and a duplicate-email pre-check happen first, then the
submitted data (hashed password included) is held in Redis under a key
derived from the email until `verify_email` is called with the matching
OTP code — that's the only path that ever inserts a `users` row. If the
code is never entered, the Redis entry simply expires and nothing was ever
persisted. The verification email is only ever queued by the router
*after* `register` returns successfully.
"""

from __future__ import annotations

import hmac
import secrets
from dataclasses import dataclass, replace
from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.request_context import get_request_id
from app.modules.authentication.email_otp import generate_email_otp, hash_code
from app.modules.authentication.exceptions import (
    DatabaseUnavailableError,
    EmailAlreadyRegisteredError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidOrExpiredCodeError,
    LoginFailedError,
    RegistrationFailedError,
)
from app.modules.authentication.passwords import hash_password, needs_rehash, verify_password
from app.modules.authentication.pending_store import (
    PendingRegistration,
    delete_pending_registration,
    get_pending_registration,
    record_failed_attempt,
    save_pending_registration,
)
from app.modules.authentication.rate_limit import enforce_rate_limit
from app.modules.authentication.schemas import RegisterRequest
from app.modules.users.models import User, UserStatus
from app.modules.users.repository import UserRepository

logger = get_logger(__name__)


@dataclass(frozen=True)
class IssuedVerification:
    """Returned by `register`/`resend_verification` — neither creates a
    `users` row, so this carries only what's needed to send the email
    (never the full `User` model, which doesn't exist yet)."""

    email: str
    full_name: str
    raw_code: str


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings, redis: Redis) -> None:
        self._session = session
        self._settings = settings
        self._redis = redis
        self._users = UserRepository(session)

    async def _precheck_database(self) -> None:
        try:
            await self._session.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            raise DatabaseUnavailableError() from exc

    async def register(self, payload: RegisterRequest, *, client_ip: str) -> IssuedVerification:
        normalized_email = payload.email.strip().lower()

        await enforce_rate_limit(
            self._redis,
            scope="ip",
            identifier=client_ip,
            limit=self._settings.registration_rate_limit_per_ip,
            window_seconds=self._settings.registration_rate_limit_per_ip_window_seconds,
        )
        await enforce_rate_limit(
            self._redis,
            scope="email",
            identifier=normalized_email,
            limit=self._settings.registration_rate_limit_per_email,
            window_seconds=self._settings.registration_rate_limit_per_email_window_seconds,
        )

        await self._precheck_database()

        existing = await self._users.get_by_email(normalized_email)
        if existing is not None:
            logger.info("Duplicate email registration attempt (request_id=%s)", get_request_id())
            raise EmailAlreadyRegisteredError()

        password_hash = hash_password(payload.password)
        now = datetime.now(timezone.utc)

        # A resubmission for the same still-unverified email simply
        # overwrites the pending record below (single key per email) —
        # only the latest submission's code is ever valid.
        raw_code, code_hash = generate_email_otp()
        pending = PendingRegistration(
            full_name=payload.full_name,
            email=normalized_email,
            organization_name=payload.organization_name,
            role_or_use_case=payload.role_or_use_case,
            password_hash=password_hash,
            terms_version=self._settings.terms_version,
            privacy_version=self._settings.privacy_version,
            terms_accepted_at=now.isoformat(),
            code_hash=code_hash,
        )
        ttl_seconds = self._settings.email_verification_expiry_minutes * 60
        await save_pending_registration(self._redis, registration=pending, ttl_seconds=ttl_seconds)

        logger.info("Registration pending verification (request_id=%s)", get_request_id())
        return IssuedVerification(
            email=normalized_email, full_name=payload.full_name, raw_code=raw_code
        )

    async def verify_email(self, email: str, code: str) -> User:
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        pending = await get_pending_registration(self._redis, normalized_email)
        if pending is None:
            raise InvalidOrExpiredCodeError()

        if not hmac.compare_digest(hash_code(code), pending.code_hash):
            attempts = await record_failed_attempt(self._redis, normalized_email)
            if attempts is not None and attempts >= self._settings.email_otp_max_attempts:
                # Too many wrong guesses — invalidate the code outright so
                # the user must request a fresh one.
                await delete_pending_registration(self._redis, normalized_email)
            raise InvalidOrExpiredCodeError()

        await self._precheck_database()

        existing = await self._users.get_by_email(pending.email)
        if existing is not None:
            # Already created (e.g. the code was submitted twice, or in two
            # tabs) - clean up and treat this code as consumed rather than
            # inserting a duplicate.
            await delete_pending_registration(self._redis, pending.email)
            raise InvalidOrExpiredCodeError()

        user = self._users.create(
            full_name=pending.full_name,
            email=pending.email,
            organization_name=pending.organization_name,
            role_or_use_case=pending.role_or_use_case,
            password_hash=pending.password_hash,
            terms_accepted_at=datetime.fromisoformat(pending.terms_accepted_at),
            terms_version=pending.terms_version,
            privacy_version=pending.privacy_version,
            status=UserStatus.ACTIVE,
            email_verified_at=now,
        )

        try:
            # Flush (not commit) first so the unique-email constraint is
            # enforced by the database before we drop the pending Redis
            # entry — closes the race between the pre-check above and a
            # concurrent verification/registration of the same email.
            await self._session.flush()
        except IntegrityError as exc:
            await self._session.rollback()
            await delete_pending_registration(self._redis, pending.email)
            logger.info(
                "Verification rejected by unique constraint (request_id=%s)", get_request_id()
            )
            raise EmailAlreadyRegisteredError() from exc

        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            raise RegistrationFailedError() from exc

        await delete_pending_registration(self._redis, pending.email)

        logger.info("Email verified (request_id=%s, user_id=%s)", get_request_id(), user.id)
        return user

    async def resend_verification(self, email: str) -> IssuedVerification | None:
        normalized_email = email.strip().lower()

        await enforce_rate_limit(
            self._redis,
            scope="resend",
            identifier=normalized_email,
            limit=self._settings.registration_rate_limit_per_email,
            window_seconds=self._settings.registration_rate_limit_per_email_window_seconds,
        )

        # Same outcome whether no pending registration exists for this email
        # or it already expired — avoids account enumeration via this
        # endpoint. (An already-verified/active email also has no pending
        # entry, so it falls into this same branch.)
        pending = await get_pending_registration(self._redis, normalized_email)
        if pending is None:
            return None

        raw_code, code_hash = generate_email_otp()
        refreshed = replace(pending, code_hash=code_hash, attempts=0)
        ttl_seconds = self._settings.email_verification_expiry_minutes * 60
        await save_pending_registration(self._redis, registration=refreshed, ttl_seconds=ttl_seconds)

        logger.info("Verification resent (request_id=%s)", get_request_id())
        return IssuedVerification(
            email=pending.email, full_name=pending.full_name, raw_code=raw_code
        )

    async def login(self, email: str, password: str) -> User:
        """Authenticates email + password against the `users` table.

        Uses a generic `InvalidCredentialsError` for both unknown email and
        wrong password (no account enumeration via this endpoint), but a
        distinct `EmailNotVerifiedError` for accounts that registered but
        never entered their OTP — the UI needs to point those users at the
        verification step.
        """
        normalized_email = email.strip().lower()

        user = await self._users.get_by_email(normalized_email)
        if user is None:
            raise InvalidCredentialsError()

        if user.status == UserStatus.PENDING_VERIFICATION:
            raise EmailNotVerifiedError()
        if user.status != UserStatus.ACTIVE:
            # Suspended/disabled accounts get the same generic message.
            raise InvalidCredentialsError()

        if not verify_password(password, user.password_hash):
            logger.info("Failed login (request_id=%s)", get_request_id())
            raise InvalidCredentialsError()

        # Silently upgrade weak/legacy hashes to current Argon2id params on
        # successful login (see `passwords.needs_rehash`).
        if needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)

        user.last_login_at = datetime.now(timezone.utc)

        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            raise LoginFailedError() from exc

        logger.info("User logged in (request_id=%s, user_id=%s)", get_request_id(), user.id)
        return user

    async def social_signup_or_login(self, *, email: str, name: str) -> User:
        """Creates the account on first OAuth sign-in (Google, GitHub, …), or
        signs the user in on subsequent ones. The provider has already
        verified the email, so the account is created `ACTIVE` with
        `email_verified_at` set — no OTP step. An existing
        pending-verification account is activated; an existing
        suspended/disabled account is rejected.

        OAuth accounts never have a usable password: a random hash is
        stored to satisfy the NOT NULL column while making password login
        impossible.
        """
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        user = await self._users.get_by_email(normalized_email)
        if user is None:
            user = self._users.create(
                full_name=name or normalized_email.split("@")[0],
                email=normalized_email,
                organization_name=None,
                role_or_use_case=None,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                terms_accepted_at=now,
                terms_version=self._settings.terms_version,
                privacy_version=self._settings.privacy_version,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            try:
                # Enforce the unique-email constraint before committing.
                await self._session.flush()
            except IntegrityError as exc:
                await self._session.rollback()
                logger.info(
                    "OAuth signup rejected by unique constraint (request_id=%s)",
                    get_request_id(),
                )
                raise EmailAlreadyRegisteredError() from exc
        elif user.status == UserStatus.PENDING_VERIFICATION:
            # Registered with a password but never entered the OTP — the
            # provider-verified email is enough to activate the account.
            user.status = UserStatus.ACTIVE
            user.email_verified_at = now
        elif user.status != UserStatus.ACTIVE:
            raise InvalidCredentialsError()

        user.last_login_at = now
        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            raise LoginFailedError() from exc

        logger.info(
            "Social sign-in (request_id=%s, user_id=%s)", get_request_id(), user.id
        )
        return user

    async def get_user_by_email(self, email: str) -> User | None:
        return await self._users.get_by_email(email.strip().lower())
