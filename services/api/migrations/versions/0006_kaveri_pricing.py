"""create kaveri_village_mapping and kaveri_rate_cache tables

Revision ID: 0006_kaveri_pricing
Revises: 0005_phone_number
Create Date: 2026-08-21 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0006_kaveri_pricing"
down_revision: str | None = "0005_phone_number"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "kaveri_village_mapping",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("kgis_village_code", sa.String(length=50), nullable=False),
        sa.Column("village_name", sa.String(length=200), nullable=False),
        sa.Column("district", sa.String(length=100), nullable=False),
        sa.Column("taluk", sa.String(length=100), nullable=False),
        sa.Column("hobli", sa.String(length=100), nullable=False),
        sa.Column("kaveri_district_code", sa.String(length=50), nullable=False),
        sa.Column("kaveri_taluk_code", sa.String(length=50), nullable=False),
        sa.Column("kaveri_hobli_code", sa.String(length=50), nullable=False),
        sa.Column("kaveri_village_code", sa.String(length=50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "btrim(kgis_village_code) <> ''", name="ck_kaveri_village_mapping_kgis_code_not_blank"
        ),
    )
    op.create_unique_constraint(
        "uq_kaveri_village_mapping_kgis_code", "kaveri_village_mapping", ["kgis_village_code"]
    )
    op.create_index(
        "ix_kaveri_village_mapping_kgis_code", "kaveri_village_mapping", ["kgis_village_code"]
    )

    op.create_table(
        "kaveri_rate_cache",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("kaveri_village_code", sa.String(length=50), nullable=False),
        sa.Column("road_code", sa.String(length=50), nullable=False),
        sa.Column("property_type", sa.String(length=50), nullable=False),
        sa.Column("standard_rate", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_unique_constraint(
        "uq_kaveri_rate_cache_village_road_property",
        "kaveri_rate_cache",
        ["kaveri_village_code", "road_code", "property_type"],
    )
    op.create_index(
        "ix_kaveri_rate_cache_kaveri_village_code", "kaveri_rate_cache", ["kaveri_village_code"]
    )


def downgrade() -> None:
    op.drop_table("kaveri_rate_cache")
    op.drop_table("kaveri_village_mapping")
