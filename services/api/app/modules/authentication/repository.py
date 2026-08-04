"""Data access for the `email_verification_tokens` table."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.authentication.models import EmailVerificationToken


class EmailVerificationTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def create(
        self, *, user_id: uuid.UUID, token_hash: str, expires_at: datetime
    ) -> EmailVerificationToken:
        token = EmailVerificationToken(
            user_id=user_id, token_hash=token_hash, expires_at=expires_at
        )
        self._session.add(token)
        return token

    async def get_valid_by_hash(
        self, token_hash: str, *, now: datetime
    ) -> EmailVerificationToken | None:
        result = await self._session.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.token_hash == token_hash,
                EmailVerificationToken.consumed_at.is_(None),
                EmailVerificationToken.expires_at > now,
            )
        )
        return result.scalar_one_or_none()

    async def invalidate_unconsumed_for_user(
        self, user_id: uuid.UUID, *, consumed_at: datetime
    ) -> None:
        await self._session.execute(
            update(EmailVerificationToken)
            .where(
                EmailVerificationToken.user_id == user_id,
                EmailVerificationToken.consumed_at.is_(None),
            )
            .values(consumed_at=consumed_at)
        )
