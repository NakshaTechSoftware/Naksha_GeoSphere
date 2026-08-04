"""create users and email verification tables

Revision ID: 0002_users_and_verification
Revises: 0001_enable_postgis_pgcrypto
Create Date: 2026-08-04 00:00:00.000000

Named short (27 chars) rather than something like
`0002_create_users_and_email_verification` (40 chars) because Alembic's
default `alembic_version.version_num` column is VARCHAR(32) — a longer
revision id fails at upgrade time with `StringDataRightTruncationError`.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_users_and_verification"
down_revision: str | None = "0001_enable_postgis_pgcrypto"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

USER_STATUS_VALUES = ("pending_verification", "active", "suspended", "disabled")
# create_type=False: the enum type is created/dropped explicitly below so
# create_table/drop_table don't also try to manage it (the standard
# Alembic pattern for native Postgres enums).
user_status_enum = postgresql.ENUM(*USER_STATUS_VALUES, name="user_status", create_type=False)


def upgrade() -> None:
    # citext: case-insensitive text comparison/uniqueness for email,
    # without a separate lower(email) functional index.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext;")

    user_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("organization_name", sa.String(length=200), nullable=False),
        sa.Column("role_or_use_case", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            user_status_enum,
            nullable=False,
            server_default="pending_verification",
        ),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("terms_version", sa.String(length=32), nullable=False),
        sa.Column("privacy_version", sa.String(length=32), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("btrim(full_name) <> ''", name="ck_users_full_name_not_blank"),
        sa.CheckConstraint(
            "btrim(organization_name) <> ''", name="ck_users_organization_name_not_blank"
        ),
        sa.CheckConstraint(
            "btrim(role_or_use_case) <> ''", name="ck_users_role_or_use_case_not_blank"
        ),
    )
    # CITEXT already compares case-insensitively, so this single UNIQUE
    # constraint (and the index Postgres creates to enforce it) is
    # sufficient for case-insensitive email uniqueness — no functional
    # lower(email) index needed.
    op.create_unique_constraint("uq_users_email", "users", ["email"])
    op.create_index("ix_users_status", "users", ["status"])
    op.create_index("ix_users_created_at", "users", ["created_at"])
    op.create_index("ix_users_organization_name", "users", ["organization_name"])

    op.create_table(
        "email_verification_tokens",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_email_verification_tokens_user_id",
            ondelete="CASCADE",
        ),
    )
    op.create_unique_constraint(
        "uq_email_verification_tokens_token_hash", "email_verification_tokens", ["token_hash"]
    )
    op.create_index(
        "ix_email_verification_tokens_user_id", "email_verification_tokens", ["user_id"]
    )
    op.create_index(
        "ix_email_verification_tokens_expires_at", "email_verification_tokens", ["expires_at"]
    )


def downgrade() -> None:
    op.drop_table("email_verification_tokens")
    op.drop_table("users")
    user_status_enum.drop(op.get_bind(), checkfirst=True)
    op.execute("DROP EXTENSION IF EXISTS citext;")
