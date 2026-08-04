#!/bin/sh
# Naksha GeoSphere storage server — PostgreSQL first-boot initialization.
#
# Runs automatically, exactly once, the first time the data directory
# (E:/Naksha_GeoSphere_Storage/data/postgres on the host) is empty —
# this is the standard docker-entrypoint-initdb.d convention of the
# official postgres/postgis images. It will NOT re-run against an
# existing data directory, which is correct: extensions are already
# enabled and the role is already restricted by that point.
#
# What this does:
#   1. Enables postgis + pgcrypto in POSTGRES_DB (idempotent — safe even
#      if the postgis/postgis base image already enabled postgis itself).
#   2. Strips SUPERUSER/CREATEDB/CREATEROLE from POSTGRES_USER afterwards
#      so the future application (services/api) never connects as a
#      PostgreSQL superuser. POSTGRES_USER still owns POSTGRES_DB and
#      keeps full DML/DDL rights inside it.
#
# NOTE: because POSTGRES_USER loses CREATE EXTENSION privilege after
# this runs, adding a *new* extension later requires a superuser
# session (e.g. temporarily re-granting SUPERUSER, or running it as the
# `postgres` role if one exists) — this is intentional least-privilege
# behavior, not an oversight. See infrastructure/storage-server/README.md.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    ALTER ROLE "$POSTGRES_USER" NOSUPERUSER NOCREATEDB NOCREATEROLE;
EOSQL

echo "Naksha GeoSphere: postgis + pgcrypto enabled; $POSTGRES_USER restricted to non-superuser."
