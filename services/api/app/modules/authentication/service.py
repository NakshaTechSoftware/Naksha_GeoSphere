"""Registration and email-verification business logic.

The registration transaction follows a fixed order: rate limits, then a
database readiness check, then the duplicate-email pre-check, then
password hashing, then the `users` insert, then the verification-token
insert, then commit. The verification email is only ever queued by the
router *after* this method returns successfully — never before commit.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.logging import get_logger
from app.core.request_context import get_request_id
from app.modules.authentication.exceptions import (
    DatabaseUnavailableError,
    EmailAlreadyRegisteredError,
    InvalidOrExpiredTokenError,
    RegistrationFailedError,
)
from app.modules.authentication.passwords import hash_password
from app.modules.authentication.rate_limit import enforce_rate_limit
from app.modules.authentication.repository import EmailVerificationTokenRepository
from app.modules.authentication.schemas import RegisterRequest
from app.modules.authentication.tokens import generate_verification_token, hash_token
from app.modules.users.models import User, UserStatus
from app.modules.users.repository import UserRepository

logger = get_logger(__name__)


@dataclass(frozen=True)
class IssuedVerification:
    user: User
    raw_token: str


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings, redis: Redis) -> None:
        self._session = session
        self._settings = settings
        self._redis = redis
        self._users = UserRepository(session)
        self._tokens = EmailVerificationTokenRepository(session)

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

        user = self._users.create(
            full_name=payload.full_name,
            email=normalized_email,
            organization_name=payload.organization_name,
            role_or_use_case=payload.role_or_use_case,
            password_hash=password_hash,
            terms_accepted_at=now,
            terms_version=self._settings.terms_version,
            privacy_version=self._settings.privacy_version,
        )

        try:
            # Flush (not commit) first so the unique-email constraint is
            # enforced by the database before the token row is created —
            # closes the race between the pre-check above and a
            # concurrent insert of the same email.
            await self._session.flush()
        except IntegrityError as exc:
            await self._session.rollback()
            logger.info(
                "Registration rejected by unique constraint (request_id=%s)", get_request_id()
            )
            raise EmailAlreadyRegisteredError() from exc

        raw_token, token_hash_value = generate_verification_token()
        expires_at = now + timedelta(minutes=self._settings.email_verification_expiry_minutes)
        self._tokens.create(user_id=user.id, token_hash=token_hash_value, expires_at=expires_at)

        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            logger.error("Registration commit failed (request_id=%s)", get_request_id())
            raise RegistrationFailedError() from exc

        logger.info("Registration succeeded (request_id=%s, user_id=%s)", get_request_id(), user.id)
        return IssuedVerification(user=user, raw_token=raw_token)

    async def verify_email(self, raw_token: str) -> User:
        token_hash_value = hash_token(raw_token)
        now = datetime.now(timezone.utc)

        token = await self._tokens.get_valid_by_hash(token_hash_value, now=now)
        if token is None:
            raise InvalidOrExpiredTokenError()

        user = await self._users.get_by_id(token.user_id)
        if user is None:
            raise InvalidOrExpiredTokenError()

        token.consumed_at = now
        await self._tokens.invalidate_unconsumed_for_user(user.id, consumed_at=now)
        self._users.mark_verified(user, verified_at=now)

        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            raise RegistrationFailedError() from exc

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

        user = await self._users.get_by_email(normalized_email)
        # Same outcome whether the account doesn't exist or is already
        # verified — avoids account enumeration via this endpoint.
        if user is None or user.status != UserStatus.PENDING_VERIFICATION:
            return None

        now = datetime.now(timezone.utc)
        await self._tokens.invalidate_unconsumed_for_user(user.id, consumed_at=now)
        raw_token, token_hash_value = generate_verification_token()
        expires_at = now + timedelta(minutes=self._settings.email_verification_expiry_minutes)
        self._tokens.create(user_id=user.id, token_hash=token_hash_value, expires_at=expires_at)

        try:
            await self._session.commit()
        except Exception as exc:  # noqa: BLE001 — never leak the driver exception
            await self._session.rollback()
            raise RegistrationFailedError() from exc

        logger.info("Verification resent (request_id=%s, user_id=%s)", get_request_id(), user.id)
        return IssuedVerification(user=user, raw_token=raw_token)
