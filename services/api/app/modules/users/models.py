"""SQLAlchemy model for the `users` table.

Rows are created only through `AuthService.register`
(`app/modules/authentication/service.py`) — never insert directly, so
password hashing, email normalization, and terms acceptance stay
consistent. The table itself is created only by the Alembic migration
`0002_users_and_verification`, never dynamically.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class UserStatus(str, enum.Enum):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DISABLED = "disabled"


user_status_enum = SAEnum(
    UserStatus,
    name="user_status",
    values_callable=lambda enum_cls: [member.value for member in enum_cls],
)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("btrim(full_name) <> ''", name="ck_users_full_name_not_blank"),
        CheckConstraint(
            "btrim(organization_name) <> ''", name="ck_users_organization_name_not_blank"
        ),
        CheckConstraint(
            "btrim(role_or_use_case) <> ''", name="ck_users_role_or_use_case_not_blank"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True)
    organization_name: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    role_or_use_case: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Unused since phone-OTP verification was removed; kept nullable so the
    # column can be dropped in a future migration without a data migration.
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        user_status_enum,
        nullable=False,
        server_default=UserStatus.PENDING_VERIFICATION.value,
        index=True,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    terms_version: Mapped[str] = mapped_column(String(32), nullable=False)
    privacy_version: Mapped[str] = mapped_column(String(32), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
