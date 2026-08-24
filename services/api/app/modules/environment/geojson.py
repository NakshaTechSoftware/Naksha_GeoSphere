"""Builds a GeoJSON FeatureCollection of CPCB monitoring stations
(spec section K) — one Point feature per physical station."""

from __future__ import annotations

from app.modules.environment.schemas import CpcbStation, GeoJsonFeature, GeoJsonFeatureCollection


def stations_to_geojson(stations: list[CpcbStation]) -> GeoJsonFeatureCollection:
    features = [
        GeoJsonFeature(
            geometry={"type": "Point", "coordinates": [station.longitude, station.latitude]},
            properties={
                "station_id": station.station_id,
                "station": station.station,
                "city": station.city,
                "state": station.state,
                "aqi": station.aqi_value,
                "aqi_category": station.aqi_category.value if station.aqi_category else None,
                "aqi_source": station.aqi_source.value,
                "last_update": station.last_update.isoformat() if station.last_update else None,
                "pollutants": {
                    key: value.model_dump() for key, value in station.pollutants.items()
                },
                "source": station.source,
                "source_type": station.source_type,
            },
        )
        for station in stations
    ]
    return GeoJsonFeatureCollection(features=features)
