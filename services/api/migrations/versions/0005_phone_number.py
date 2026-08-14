"""add users.phone_number and users.phone_verified_at

Revision ID: 0005_phone_number
Revises: 0004_optional_org_role
Create Date: 2026-08-13 12:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_phone_number"
down_revision: str | None = "0004_optional_org_role"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # Both nullable: the phone-OTP gate is optional, so pre-existing rows
    # (and phone-less signups) keep NULL in both columns.
    op.add_column(
        "users", sa.Column("phone_number", sa.String(length=20), nullable=True)
    )
    op.create_index("ix_users_phone_number", "users", ["phone_number"])
    op.add_column(
        "users",
        sa.Column(
            "phone_verified_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "phone_verified_at")
    op.drop_index("ix_users_phone_number", table_name="users")
    op.drop_column("users", "phone_number")
