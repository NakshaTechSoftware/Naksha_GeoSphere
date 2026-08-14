"""Data access for the `users` table. Never insert a `User` outside
`AuthService.register` — this repository only assembles the statements."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User, UserStatus


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_email(self, email: str) -> User | None:
        """CITEXT makes this comparison case-insensitive at the database
        level — no need to lower() either side."""
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self._session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    def create(
        self,
        *,
        full_name: str,
        email: str,
        organization_name: str | None,
        role_or_use_case: str | None,
        password_hash: str,
        terms_accepted_at: datetime,
        terms_version: str,
        privacy_version: str,
        status: UserStatus = UserStatus.PENDING_VERIFICATION,
        email_verified_at: datetime | None = None,
        phone_number: str | None = None,
        phone_verified_at: datetime | None = None,
    ) -> User:
        user = User(
            full_name=full_name,
            email=email,
            organization_name=organization_name,
            role_or_use_case=role_or_use_case,
            password_hash=password_hash,
            status=status,
            terms_accepted_at=terms_accepted_at,
            terms_version=terms_version,
            privacy_version=privacy_version,
            email_verified_at=email_verified_at,
            phone_number=phone_number,
            phone_verified_at=phone_verified_at,
        )
        self._session.add(user)
        return user
