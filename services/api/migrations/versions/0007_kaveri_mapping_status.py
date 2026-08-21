"""add mapping_status/matching_score to kaveri_village_mapping, create
kaveri_mapping_progress

Revision ID: 0007_kaveri_mapping_status
Revises: 0006_kaveri_pricing
Create Date: 2026-08-21 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_kaveri_mapping_status"
down_revision: str | None = "0006_kaveri_pricing"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

MAPPING_STATUS_VALUES = ("confirmed", "pending_review", "failed")

mapping_status_enum = postgresql.ENUM(
    *MAPPING_STATUS_VALUES, name="kaveri_mapping_status", create_type=False
)


def upgrade() -> None:
    mapping_status_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "kaveri_village_mapping",
        sa.Column(
            "mapping_status",
            mapping_status_enum,
            nullable=False,
            server_default="confirmed",
        ),
    )
    op.add_column(
        "kaveri_village_mapping",
        sa.Column("matching_score", sa.Numeric(precision=5, scale=2), nullable=True),
    )

    op.create_table(
        "kaveri_mapping_progress",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("kgis_village_code", sa.String(length=50), nullable=False),
        sa.Column("status", mapping_status_enum, nullable=False),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_unique_constraint(
        "uq_kaveri_mapping_progress_kgis_code",
        "kaveri_mapping_progress",
        ["kgis_village_code"],
    )
    op.create_index(
        "ix_kaveri_mapping_progress_kgis_code",
        "kaveri_mapping_progress",
        ["kgis_village_code"],
    )


def downgrade() -> None:
    op.drop_table("kaveri_mapping_progress")
    op.drop_column("kaveri_village_mapping", "matching_score")
    op.drop_column("kaveri_village_mapping", "mapping_status")
    mapping_status_enum.drop(op.get_bind(), checkfirst=True)
