"""Tests for CPCB row-level parsing and per-station grouping.

Fixture rows below mirror the real data.gov.in response shape confirmed
during development: string-typed numeric fields, `"NA"` for missing
readings, `min_value`/`max_value`/`avg_value` keys, and one row per
(station, pollutant).
"""

from __future__ import annotations

from app.modules.environment.cpcb_client import (
    coerce_float,
    coerce_last_update,
    group_into_stations,
    is_valid_coordinate,
)
from app.modules.environment.schemas import AqiSource


def _row(**overrides: object) -> dict:
    base = {
        "country": "India",
        "state": "Karnataka",
        "city": "Bengaluru",
        "station": "Silk Board, Bengaluru - KSPCB",
        "last_update": "12-08-2026 10:00:00",
        "latitude": "12.917348",
        "longitude": "77.622813",
        "pollutant_id": "PM10",
        "min_value": "44",
        "max_value": "149",
        "avg_value": "101",
    }
    base.update(overrides)
    return base


def test_coerce_float_handles_na_and_blank() -> None:
    assert coerce_float("101") == 101.0
    assert coerce_float("NA") is None
    assert coerce_float("na") is None
    assert coerce_float("") is None
    assert coerce_float(None) is None
    assert coerce_float("not-a-number") is None


def test_coerce_last_update_parses_cpcb_format_as_ist() -> None:
    result = coerce_last_update("12-08-2026 10:00:00")
    assert result is not None
    assert result.isoformat() == "2026-08-12T10:00:00+05:30"


def test_coerce_last_update_returns_none_for_garbage() -> None:
    assert coerce_last_update("not-a-date") is None
    assert coerce_last_update(None) is None


def test_is_valid_coordinate_rejects_out_of_range_and_null_island() -> None:
    assert is_valid_coordinate(12.97, 77.59) is True
    assert is_valid_coordinate(91, 77.59) is False
    assert is_valid_coordinate(12.97, -181) is False
    assert is_valid_coordinate(None, 77.59) is False
    assert is_valid_coordinate(0, 0) is False  # common "no GPS fix" sentinel


def test_group_into_stations_groups_multiple_pollutant_rows() -> None:
    rows = [
        _row(pollutant_id="PM10"),
        _row(pollutant_id="NO2", min_value="6", max_value="130", avg_value="20"),
        _row(pollutant_id="OZONE", min_value="18", max_value="24", avg_value="21"),
    ]
    stations = group_into_stations(rows)

    assert len(stations) == 1
    station = stations[0]
    assert station.station == "Silk Board, Bengaluru - KSPCB"
    assert set(station.pollutants) == {"PM10", "NO2", "O3"}  # OZONE normalized to O3
    assert station.pollutants["PM10"].avg == 101.0


def test_group_into_stations_drops_entirely_na_pollutant() -> None:
    rows = [_row(pollutant_id="NO2", min_value="NA", max_value="NA", avg_value="NA")]
    stations = group_into_stations(rows)
    assert stations[0].pollutants == {}


def test_group_into_stations_drops_invalid_coordinates() -> None:
    rows = [_row(latitude="999", longitude="77.6")]
    assert group_into_stations(rows) == []


def test_group_into_stations_drops_blank_station_or_city() -> None:
    assert group_into_stations([_row(station="")]) == []
    assert group_into_stations([_row(city="")]) == []


def test_group_into_stations_keeps_first_on_duplicate_pollutant_row() -> None:
    rows = [
        _row(pollutant_id="PM10", avg_value="101"),
        _row(pollutant_id="PM10", avg_value="999"),  # duplicate reading for same station+pollutant
    ]
    stations = group_into_stations(rows)
    assert stations[0].pollutants["PM10"].avg == 101.0


def test_group_into_stations_never_fabricates_missing_pollutants() -> None:
    rows = [_row(pollutant_id="PM10")]
    stations = group_into_stations(rows)
    assert "PM2.5" not in stations[0].pollutants
    assert "NH3" not in stations[0].pollutants


def test_group_into_stations_computes_aqi_when_enough_pollutants() -> None:
    rows = [
        _row(pollutant_id="PM2.5", avg_value="45"),
        _row(pollutant_id="PM10", avg_value="80"),
        _row(pollutant_id="NO2", avg_value="30"),
    ]
    station = group_into_stations(rows)[0]
    assert station.aqi_value is not None
    assert station.aqi_source == AqiSource.CALCULATED_CPCB


def test_group_into_stations_marks_aqi_not_available_below_minimum() -> None:
    rows = [_row(pollutant_id="PM10", avg_value="80")]  # only one pollutant
    station = group_into_stations(rows)[0]
    assert station.aqi_value is None
    assert station.aqi_source == AqiSource.NOT_AVAILABLE


def test_group_into_stations_separates_two_different_stations() -> None:
    rows = [
        _row(station="Silk Board, Bengaluru - KSPCB", pollutant_id="PM10"),
        _row(station="Peenya, Bengaluru - CPCB", pollutant_id="PM10"),
    ]
    stations = group_into_stations(rows)
    assert len(stations) == 2
    assert {s.station for s in stations} == {
        "Silk Board, Bengaluru - KSPCB",
        "Peenya, Bengaluru - CPCB",
    }
