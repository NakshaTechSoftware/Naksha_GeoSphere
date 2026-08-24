"""widen kaveri_rate_cache.property_type from varchar(50) to varchar(255)

Root cause of a live production bug: real Kaveri agricultural category
labels are free text and can exceed 50 characters (observed live, Kodagu
district: "Dry, Paddy/Areca/Coconut/Mango/Grapes/Fruit grown with rain
water, Other Soil", 82 chars). The narrow column caused every parcel
resolving to a long category label to fail with
asyncpg.exceptions.StringDataRightTruncationError, masked by the endpoint's
broad exception handler as a generic `kaveri_api_error`.

Revision ID: 0009_widen_ptype
Revises: 0008_kaveri_rate_cache_metadata
Create Date: 2026-08-24 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
# NOTE: alembic's own `alembic_version.version_num` column defaults to
# VARCHAR(32) - a revision id longer than that fails with the exact same
# StringDataRightTruncationError this migration exists to fix elsewhere,
# just against alembic's own bookkeeping table. Keep every revision id here
# at or under 32 characters.
revision: str = "0009_widen_ptype"
down_revision: str | None = "0008_kaveri_rate_cache_metadata"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "kaveri_rate_cache",
        "property_type",
        existing_type=sa.String(length=50),
        type_=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "kaveri_rate_cache",
        "property_type",
        existing_type=sa.String(length=255),
        type_=sa.String(length=50),
        existing_nullable=False,
    )
