"""add provenance metadata (rate_unit/road_confidence/road_resolution_method/
classification) to kaveri_rate_cache

Revision ID: 0008_kaveri_rate_cache_metadata
Revises: 0007_kaveri_mapping_status
Create Date: 2026-08-24 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_kaveri_rate_cache_metadata"
down_revision: str | None = "0007_kaveri_mapping_status"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("kaveri_rate_cache", sa.Column("rate_unit", sa.String(length=20), nullable=True))
    op.add_column(
        "kaveri_rate_cache",
        sa.Column("road_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
    )
    op.add_column(
        "kaveri_rate_cache", sa.Column("road_resolution_method", sa.String(length=30), nullable=True)
    )
    op.add_column("kaveri_rate_cache", sa.Column("classification", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("kaveri_rate_cache", "classification")
    op.drop_column("kaveri_rate_cache", "road_resolution_method")
    op.drop_column("kaveri_rate_cache", "road_confidence")
    op.drop_column("kaveri_rate_cache", "rate_unit")
