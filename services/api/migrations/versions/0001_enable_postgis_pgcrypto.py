"""enable postgis and pgcrypto extensions

Revision ID: 0001_enable_postgis_pgcrypto
Revises:
Create Date: 2026-08-03 00:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_enable_postgis_pgcrypto"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # PostGIS: spatial types, indexes, and functions used by all future
    # geospatial modules (catalog, aoi, datasets, ...).
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    # pgcrypto: gen_random_uuid() and cryptographic helpers used for
    # primary keys and future secure tokens.
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pgcrypto;")
    op.execute("DROP EXTENSION IF EXISTS postgis;")
