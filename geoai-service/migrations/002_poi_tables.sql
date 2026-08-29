-- GeoAI Tool Adapter Service — migration 002
-- Five POI tables (Feature 7). Each is independent — this service never
-- creates or modifies any table owned by services/api.

CREATE TABLE IF NOT EXISTS poi_police_station (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(300),
    phone VARCHAR(30),
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_poi_police_station_geometry ON poi_police_station USING GIST (geometry);

CREATE TABLE IF NOT EXISTS poi_hospital (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(300),
    phone VARCHAR(30),
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_poi_hospital_geometry ON poi_hospital USING GIST (geometry);

CREATE TABLE IF NOT EXISTS poi_school (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(300),
    phone VARCHAR(30),
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_poi_school_geometry ON poi_school USING GIST (geometry);

CREATE TABLE IF NOT EXISTS poi_atm (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(300),
    phone VARCHAR(30),
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_poi_atm_geometry ON poi_atm USING GIST (geometry);

CREATE TABLE IF NOT EXISTS poi_pharmacy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    address VARCHAR(300),
    phone VARCHAR(30),
    geometry GEOMETRY(POINT, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_poi_pharmacy_geometry ON poi_pharmacy USING GIST (geometry);
