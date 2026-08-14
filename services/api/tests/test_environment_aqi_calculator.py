"""Tests for the CPCB National AQI breakpoint calculator."""

from __future__ import annotations

from app.modules.environment.aqi_calculator import calculate_cpcb_aqi, category_for_aqi
from app.modules.environment.schemas import AqiCategory


def test_category_boundaries() -> None:
    assert category_for_aqi(0) == AqiCategory.GOOD
    assert category_for_aqi(50) == AqiCategory.GOOD
    assert category_for_aqi(51) == AqiCategory.SATISFACTORY
    assert category_for_aqi(100) == AqiCategory.SATISFACTORY
    assert category_for_aqi(101) == AqiCategory.MODERATE
    assert category_for_aqi(200) == AqiCategory.MODERATE
    assert category_for_aqi(201) == AqiCategory.POOR
    assert category_for_aqi(300) == AqiCategory.POOR
    assert category_for_aqi(301) == AqiCategory.VERY_POOR
    assert category_for_aqi(400) == AqiCategory.VERY_POOR
    assert category_for_aqi(401) == AqiCategory.SEVERE
    assert category_for_aqi(500) == AqiCategory.SEVERE


def test_returns_none_below_minimum_pollutant_count() -> None:
    # Only two pollutants — CPCB's own rule requires at least 3.
    aqi, category = calculate_cpcb_aqi({"PM2.5": 45, "PM10": 80})
    assert aqi is None
    assert category is None


def test_returns_none_without_pm25_or_pm10() -> None:
    # Three pollutants, but neither PM2.5 nor PM10 among them.
    aqi, category = calculate_cpcb_aqi({"NO2": 30, "SO2": 20, "CO": 1.5})
    assert aqi is None
    assert category is None


def test_calculates_aqi_as_max_of_sub_indices() -> None:
    # PM2.5=15 -> sub-index 25; PM10=25 -> sub-index 25; NO2=20 -> sub-index 25.
    # All low/clean readings -> AQI should land in Good/Satisfactory range.
    aqi, category = calculate_cpcb_aqi({"PM2.5": 15, "PM10": 25, "NO2": 20})
    assert aqi is not None
    assert aqi <= 50
    assert category == AqiCategory.GOOD


def test_high_pm25_dominates_and_produces_severe() -> None:
    aqi, category = calculate_cpcb_aqi({"PM2.5": 400, "PM10": 100, "NO2": 30})
    assert aqi == 500
    assert category == AqiCategory.SEVERE


def test_ignores_implausible_values_before_calculating() -> None:
    # A wildly implausible CO reading should be dropped, not distort the AQI.
    aqi, _ = calculate_cpcb_aqi({"PM2.5": 15, "PM10": 25, "NO2": 20, "CO": 1_000_000})
    # Still computed from the 3 plausible pollutants, not blown up by CO.
    assert aqi is not None
    assert aqi <= 50


def test_negative_values_are_ignored() -> None:
    aqi, category = calculate_cpcb_aqi({"PM2.5": -5, "PM10": -1, "NO2": -1})
    assert aqi is None
    assert category is None
