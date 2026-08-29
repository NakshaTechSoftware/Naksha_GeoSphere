"""Applies every migrations/*.sql file in filename order, once each.

Tracks applied filenames in a small `geoai_schema_migrations` table so
re-running this script is a no-op for anything already applied. Uses a
plain sync psycopg-free path via SQLAlchemy's sync engine (derived from
DATABASE_URL) so it can run standalone, before the async app starts.

Usage:
    DATABASE_URL=postgresql+asyncpg://... python migrations/run_migrations.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

MIGRATIONS_DIR = Path(__file__).parent


def _sync_url(database_url: str) -> str:
    # run_migrations uses psycopg2 (sync) even though the app runs on asyncpg.
    return database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(_sync_url(database_url))
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS geoai_schema_migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
        )
        applied = {row[0] for row in conn.execute(text("SELECT filename FROM geoai_schema_migrations"))}

        for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if sql_file.name in applied:
                print(f"skip  {sql_file.name} (already applied)")
                continue
            print(f"apply {sql_file.name}")
            conn.execute(text(sql_file.read_text()))
            conn.execute(
                text("INSERT INTO geoai_schema_migrations (filename) VALUES (:f)"),
                {"f": sql_file.name},
            )

    print("Migrations complete.")


if __name__ == "__main__":
    main()
