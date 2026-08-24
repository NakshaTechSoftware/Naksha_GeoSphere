"""Naksha GeoSphere — environment module.

Live weather and air-quality data aggregated from three providers:

- CPCB / data.gov.in — official government monitoring-station measurements
- Open-Meteo weather API — current weather for any coordinate
- Open-Meteo air-quality API — modeled/gridded air-quality estimates

CPCB measurements and Open-Meteo's modeled air quality are never merged
into a single number; every response keeps them labeled and separate.
"""
