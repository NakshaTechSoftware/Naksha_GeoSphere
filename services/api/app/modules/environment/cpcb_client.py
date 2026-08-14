"""Async HTTP client for the CPCB real-time AQI resource on data.gov.in,
plus row-level parsing and per-station grouping.

Confirmed against the live API during development (not assumed from
documentation):

- One row per (station, pollutant) — not one row per station.
- `filters[state]=<name>` filters server-side (confirmed: 175 Karnataka
  rows vs. 3500 national), so Karnataka listings don't need to page
  through the whole country.
- The record keys actually returned are `min_value` / `max_value` /
  `avg_value` — the resource's field *labels* are `pollutant_min/max/avg`,
  but using those label names as JSON keys would silently read nothing.
- Numeric fields arrive as strings, and a missing reading is the literal
  string `"NA"` rather than null or an absent key.
- No AQI field and no per-record units field are returned — see
  `aqi_calculator.py` for how (and whether) an AQI value gets derived.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import Settings
from app.modules.environment.aqi_calculator import calculate_cpcb_aqi
from app.modules.environment.exceptions import CpcbApiKeyMissingError, UpstreamUnavailableError
from app.modules.environment.schemas import AqiSource, CpcbStation, PollutantReading

BASE_URL = "https://api.data.gov.in/resource/3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
PAGE_SIZE = 100
MAX_PAGES = 50  # hard ceiling: 5000 rows, well above the ~3500-row national dataset

_TIMEOUT = httpx.Timeout(connect=3.0, read=8.0, write=3.0, pool=3.0)
_IST = timezone(timedelta(hours=5, minutes=30))
# data.gov.in's gateway silently tarpits (hangs indefinitely, no error)
# requests carrying httpx's default `python-httpx/...` User-Agent — confirmed
# during development: identical requests return instantly once a
# non-library User-Agent is set. Anything other than a bare HTTP-client
# signature works; this is an honest app identifier, not a spoofed browser.
_HEADERS = {"User-Agent": "NakshaGeoSphere/1.0 (+environment-module)"}

# CPCB's real-time feed spells ozone "OZONE"; normalize to "O3" so it lines
# up with the Open-Meteo modeled field and the spec's grouping example.
_POLLUTANT_ALIASES = {"OZONE": "O3"}


def _normalize_pollutant(pollutant_id: str) -> str:
    key = pollutant_id.strip().upper()
    return _POLLUTANT_ALIASES.get(key, pollutant_id.strip())


def coerce_float(raw: str | None) -> float | None:
    """Handles "NA", empty strings, and unparseable text by returning
    None — missing means missing, never a fabricated 0."""
    if raw is None:
        return None
    text = raw.strip()
    if not text or text.upper() == "NA":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def coerce_last_update(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        # CPCB format: "12-08-2026 10:00:00" (day-month-year, IST, no offset).
        naive = datetime.strptime(raw.strip(), "%d-%m-%Y %H:%M:%S")
        return naive.replace(tzinfo=_IST)
    except ValueError:
        return None


def is_valid_coordinate(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return False
    return not (lat == 0 and lon == 0)  # (0, 0) almost always means "no GPS fix"


async def fetch_raw_records(api_key: str, *, state: str | None = None) -> list[dict[str, Any]]:
    """Pages through the full result set — the loop is driven by
    data.gov.in's declared `total`, never a hardcoded record count."""
    records: list[dict[str, Any]] = []
    offset = 0
    total: int | None = None

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS) as client:
        for _ in range(MAX_PAGES):
            params: dict[str, Any] = {
                "api-key": api_key,
                "format": "json",
                "limit": PAGE_SIZE,
                "offset": offset,
            }
            if state:
                params["filters[state]"] = state
            try:
                response = await client.get(BASE_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise UpstreamUnavailableError("CPCB / data.gov.in") from exc

            page_records = payload.get("records") or []
            records.extend(page_records)
            total = payload.get("total", total)

            offset += PAGE_SIZE
            if not page_records or (total is not None and offset >= total):
                break

    return records


def group_into_stations(records: list[dict[str, Any]]) -> list[CpcbStation]:
    """Groups (station, pollutant) rows into one CpcbStation per physical
    station (spec section I). A missing pollutant is simply absent from
    `pollutants` — never backfilled with a fabricated zero. Records with
    invalid coordinates, a blank station/city, or an entirely-"NA" reading
    are dropped rather than silently kept as noise."""
    grouped: dict[str, dict[str, Any]] = {}

    for row in records:
        lat = coerce_float(row.get("latitude"))
        lon = coerce_float(row.get("longitude"))
        if not is_valid_coordinate(lat, lon):
            continue

        station_name = (row.get("station") or "").strip()
        city = (row.get("city") or "").strip()
        if not station_name or not city:
            continue

        station_id = f"{city}::{station_name}"
        entry = grouped.setdefault(
            station_id,
            {
                "station_id": station_id,
                "station": station_name,
                "city": city,
                "state": (row.get("state") or "").strip(),
                "country": (row.get("country") or "India").strip(),
                "latitude": lat,
                "longitude": lon,
                "last_update": coerce_last_update(row.get("last_update")),
                "pollutants": {},
            },
        )

        pollutant = _normalize_pollutant(row.get("pollutant_id") or "")
        if not pollutant or pollutant in entry["pollutants"]:
            continue  # blank pollutant id, or a duplicate row for this station+pollutant

        reading = PollutantReading(
            min=coerce_float(row.get("min_value")),
            avg=coerce_float(row.get("avg_value")),
            max=coerce_float(row.get("max_value")),
        )
        if reading.min is None and reading.avg is None and reading.max is None:
            continue  # entirely "NA" — nothing usable for this pollutant
        entry["pollutants"][pollutant] = reading

    stations: list[CpcbStation] = []
    for entry in grouped.values():
        pollutant_averages = {
            key: reading.avg
            for key, reading in entry["pollutants"].items()
            if reading.avg is not None
        }
        aqi_value, aqi_category = calculate_cpcb_aqi(pollutant_averages)
        aqi_source = (
            AqiSource.CALCULATED_CPCB if aqi_value is not None else AqiSource.NOT_AVAILABLE
        )

        stations.append(
            CpcbStation(
                station_id=entry["station_id"],
                station=entry["station"],
                city=entry["city"],
                state=entry["state"],
                country=entry["country"],
                latitude=entry["latitude"],
                longitude=entry["longitude"],
                last_update=entry["last_update"],
                pollutants=entry["pollutants"],
                aqi_value=aqi_value,
                aqi_category=aqi_category,
                aqi_source=aqi_source,
            )
        )

    return stations


async def fetch_karnataka_stations(settings: Settings) -> list[CpcbStation]:
    if not settings.data_gov_in_api_key:
        raise CpcbApiKeyMissingError()
    records = await fetch_raw_records(settings.data_gov_in_api_key, state="Karnataka")
    # Defensive re-filter: trust but verify the server-side filter, in case
    # of casing/whitespace inconsistencies in the upstream data.
    records = [r for r in records if (r.get("state") or "").strip().lower() == "karnataka"]
    return group_into_stations(records)


async def fetch_all_stations(settings: Settings) -> list[CpcbStation]:
    """All India CPCB monitoring stations (no state filter). The national
    feed is ~3500 rows, so this pages through the full result set. Stations
    are grouped by physical location and normalized exactly as for Karnataka."""
    if not settings.data_gov_in_api_key:
        raise CpcbApiKeyMissingError()
    records = await fetch_raw_records(settings.data_gov_in_api_key, state=None)
    return group_into_stations(records)
