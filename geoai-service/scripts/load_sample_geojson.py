"""Loads a GeoJSON FeatureCollection of points into one poi_* table.

This is how you seed poi_police_station / poi_hospital / poi_school /
poi_atm / poi_pharmacy for local testing, before real data is sourced.
Each feature's `properties` is read loosely so it works with common
OSM-style exports (name/Name/NAME, addr:full/address, phone/Phone).

Usage:
    DATABASE_URL=postgresql+psycopg2://... python scripts/load_sample_geojson.py \\
        --type police_station --file sample_data/police_stations.geojson
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

TABLE_BY_TYPE = {
    "police_station": "poi_police_station",
    "hospital": "poi_hospital",
    "school": "poi_school",
    "atm": "poi_atm",
    "pharmacy": "poi_pharmacy",
}


def _first(props: dict, *keys: str) -> str | None:
    for key in keys:
        if key in props and props[key]:
            return str(props[key])
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--type", required=True, choices=sorted(TABLE_BY_TYPE))
    parser.add_argument("--file", required=True, type=Path)
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        sys.exit(1)

    table = TABLE_BY_TYPE[args.type]
    feature_collection = json.loads(args.file.read_text(encoding="utf-8"))
    features = feature_collection.get("features", [])

    engine = create_engine(database_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://"))
    inserted = 0
    with engine.begin() as conn:
        for feature in features:
            geom = feature.get("geometry") or {}
            if geom.get("type") != "Point":
                continue
            lon, lat = geom["coordinates"][0], geom["coordinates"][1]
            props = feature.get("properties", {})
            name = _first(props, "name", "Name", "NAME") or "Unnamed"
            category = _first(props, "category", "type", "amenity")
            address = _first(props, "address", "addr:full", "Address")
            phone = _first(props, "phone", "Phone", "contact:phone")

            conn.execute(
                text(
                    f"""
                    INSERT INTO {table} (name, category, address, phone, geometry)
                    VALUES (:name, :category, :address, :phone,
                            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
                    """
                ),
                {"name": name, "category": category, "address": address, "phone": phone,
                 "lon": lon, "lat": lat},
            )
            inserted += 1

    print(f"Inserted {inserted} feature(s) into {table}.")


if __name__ == "__main__":
    main()
