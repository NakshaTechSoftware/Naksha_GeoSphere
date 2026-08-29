-- GeoAI Tool Adapter Service — migration 001
-- Ensures PostGIS is available. Runs against the SAME Postgres instance
-- the main GeoSphere stack uses (postgis/postgis:16-3.4 already has the
-- extension installable) — safe to run even if it's already enabled by
-- services/api's own migrations (CREATE EXTENSION IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
