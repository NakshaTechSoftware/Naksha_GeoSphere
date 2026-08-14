"""make users.organization_name and role_or_use_case optional

Revision ID: 0004_optional_org_role
Revises: 0003_locations_and_datasets
Create Date: 2026-08-13 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_optional_org_role"
down_revision: str | None = "0003_locations_and_datasets"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # The existing not-blank CHECK constraints (ck_users_organization_name_not_blank,
    # ck_users_role_or_use_case_not_blank) are left in place: a CHECK passes on NULL
    # automatically, so they still reject an empty string but now allow the column
    # to be left unset entirely.
    op.alter_column(
        "users", "organization_name", existing_type=sa.String(length=200), nullable=True
    )
    op.alter_column(
        "users", "role_or_use_case", existing_type=sa.String(length=100), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "users", "role_or_use_case", existing_type=sa.String(length=100), nullable=False
    )
    op.alter_column(
        "users", "organization_name", existing_type=sa.String(length=200), nullable=False
    )
