"""Alembic environment configuration.

Uses the same async SQLAlchemy engine machinery as the application
(`app.database.base.Base`), running migrations through the async driver via
`connection.run_sync`, per the SQLAlchemy 2.0 async migration pattern. The
connection string is sourced exclusively from the DATABASE_URL environment
variable — never hardcoded here or in alembic.ini.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.database.base import Base
from app.modules.authentication.models import EmailVerificationToken  # noqa: F401
from app.modules.users.models import User  # noqa: F401
from app.modules.pricing.models import (  # noqa: F401
    KaveriRateCache,
    KaveriVillageMapping,
    MappingGenerationProgress,
)

# Import future ORM models here so autogenerate can see them, e.g.:
# from app.modules.catalog.models import Dataset  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL environment variable is required to run migrations.")
config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
