"""add crosswalk identifiers + provenance to kaveri_village_mapping

Per the Karnataka-wide KGIS -> Kaveri pipeline spec (Part 8 / Part 7), the
resolved mapping must persist not just the Kaveri codes but the corroborating
government identifiers (LGD village code, Bhucode) and the provenance of how
the match was made (mapping_method, resolved_at). This lets a parcel click
skip the live fuzzy resolver entirely once a village has been resolved (Part 21)
and lets a human reviewer audit *why* a mapping was auto-resolved.

Revision ID: 0010_kaveri_mapping_crosswalk
Revises: 0009_widen_ptype
Create Date: 2026-08-24 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_kaveri_mapping_crosswalk"
down_revision: str | None = "0009_widen_ptype"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "kaveri_village_mapping",
        sa.Column("lgd_village_code", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "kaveri_village_mapping",
        sa.Column("bhucode", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "kaveri_village_mapping",
        sa.Column("mapping_method", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "kaveri_village_mapping",
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_kaveri_mapping_lgd_village_code",
        "kaveri_village_mapping",
        ["lgd_village_code"],
    )


def downgrade() -> None:
    op.drop_index("ix_kaveri_mapping_lgd_village_code", table_name="kaveri_village_mapping")
    op.drop_column("kaveri_village_mapping", "resolved_at")
    op.drop_column("kaveri_village_mapping", "mapping_method")
    op.drop_column("kaveri_village_mapping", "bhucode")
    op.drop_column("kaveri_village_mapping", "lgd_village_code")
