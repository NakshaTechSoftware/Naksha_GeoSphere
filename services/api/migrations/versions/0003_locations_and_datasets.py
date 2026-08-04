"""create locations and datasets tables

Revision ID: 0003_locations_and_datasets
Revises: 0002_users_and_verification
Create Date: 2026-08-04 12:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_locations_and_datasets"
down_revision: str | None = "0002_users_and_verification"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

LOCATION_TYPE_VALUES = ("country", "state", "district")
DATASET_TYPE_VALUES = ("raster", "vector", "lidar", "dem")
DATASET_STATUS_VALUES = ("draft", "available", "unavailable", "archived")

location_type_enum = postgresql.ENUM(
    *LOCATION_TYPE_VALUES, name="location_type", create_type=False
)
dataset_type_enum = postgresql.ENUM(
    *DATASET_TYPE_VALUES, name="dataset_type", create_type=False
)
dataset_status_enum = postgresql.ENUM(
    *DATASET_STATUS_VALUES, name="dataset_status", create_type=False
)


def upgrade() -> None:
    # Create enum types
    location_type_enum.create(op.get_bind(), checkfirst=True)
    dataset_type_enum.create(op.get_bind(), checkfirst=True)
    dataset_status_enum.create(op.get_bind(), checkfirst=True)

    # Create locations table
    op.create_table(
        "locations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("location_type", location_type_enum, nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "boundary",
            Geometry(geometry_type="MULTIPOLYGON", srid=4326),
            nullable=True,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
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
        sa.CheckConstraint("btrim(name) <> ''", name="ck_locations_name_not_blank"),
        sa.CheckConstraint("btrim(code) <> ''", name="ck_locations_code_not_blank"),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["locations.id"],
            name="fk_locations_parent_id",
            ondelete="CASCADE",
        ),
    )
    op.create_unique_constraint("uq_locations_code", "locations", ["code"])
    op.create_index("ix_locations_name", "locations", ["name"])
    op.create_index("ix_locations_location_type", "locations", ["location_type"])
    op.create_index("ix_locations_parent_id", "locations", ["parent_id"])
    # Spatial index for boundary geometry
    op.execute("CREATE INDEX ix_locations_boundary ON locations USING GIST (boundary)")

    # Create datasets table
    op.create_table(
        "datasets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("dataset_type", dataset_type_enum, nullable=False),
        sa.Column(
            "status",
            dataset_status_enum,
            nullable=False,
            server_default="draft",
        ),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "bounding_box",
            Geometry(geometry_type="POLYGON", srid=4326),
            nullable=False,
        ),
        sa.Column("file_format", sa.String(length=50), nullable=False),
        sa.Column(
            "coordinate_system",
            sa.String(length=100),
            nullable=False,
            server_default="EPSG:4326",
        ),
        sa.Column("resolution_meters", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("s3_bucket", sa.String(length=100), nullable=False),
        sa.Column("s3_key", sa.String(length=500), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("preview_s3_key", sa.String(length=500), nullable=True),
        sa.Column(
            "price_per_sqkm",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default="0",
        ),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
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
        sa.CheckConstraint("btrim(name) <> ''", name="ck_datasets_name_not_blank"),
        sa.CheckConstraint("btrim(s3_key) <> ''", name="ck_datasets_s3_key_not_blank"),
        sa.CheckConstraint(
            "file_size_bytes > 0", name="ck_datasets_file_size_bytes_positive"
        ),
        sa.CheckConstraint(
            "price_per_sqkm >= 0", name="ck_datasets_price_per_sqkm_positive"
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name="fk_datasets_location_id",
            ondelete="CASCADE",
        ),
    )
    op.create_unique_constraint("uq_datasets_s3_key", "datasets", ["s3_key"])
    op.create_index("ix_datasets_name", "datasets", ["name"])
    op.create_index("ix_datasets_dataset_type", "datasets", ["dataset_type"])
    op.create_index("ix_datasets_status", "datasets", ["status"])
    op.create_index("ix_datasets_location_id", "datasets", ["location_id"])
    op.create_index("ix_datasets_created_at", "datasets", ["created_at"])
    # Spatial index for bounding_box geometry (critical for map searches)
    op.execute("CREATE INDEX ix_datasets_bounding_box ON datasets USING GIST (bounding_box)")


def downgrade() -> None:
    op.drop_table("datasets")
    op.drop_table("locations")
    dataset_status_enum.drop(op.get_bind(), checkfirst=True)
    dataset_type_enum.drop(op.get_bind(), checkfirst=True)
    location_type_enum.drop(op.get_bind(), checkfirst=True)
