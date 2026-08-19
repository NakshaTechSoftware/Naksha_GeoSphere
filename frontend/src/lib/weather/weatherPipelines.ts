/**
 * Provider-agnostic current/forecast weather pipelines for the Weather
 * Details panel (see types/environment.ts for the normalized shapes this
 * module produces).
 *
 * Today both `CurrentWeatherProvider` and `ForecastWeatherProvider` are
 * implemented against Open-Meteo (via the existing `fetchLocationSummary` /
 * `fetchDailyForecast` / `fetchHourlyForecast` API calls - no new network
 * requests are added here). Swapping either pipeline to a future IMD source
 * (AWS/current_wx for current, MausamGram for forecast) only means adding a
 * new provider implementing the same interface and wiring it in at the call
 * site in IndiaMapViewer.tsx - the normalized types and every UI component
 * that consumes them stay unchanged.
 */

import {
  fetchDailyForecast,
  fetchHourlyForecast,
  fetchLocationSummary,
} from "@/lib/api-client";
import type {
  CpcbStation,
  CurrentWeather,
  DailyForecastNormalized,
  HourlyForecastNormalized,
  LocationSummaryResponse,
  ModeledAirQuality,
  WeatherForecast,
} from "@/types/environment";

export interface CurrentWeatherProvider {
  getCurrent(
    lat: number,
    lon: number,
    signal?: AbortSignal
  ): Promise<{
    current: CurrentWeather | null;
    aqi: { official: CpcbStation | null; modeled: ModeledAirQuality | null; distanceKm: number | null };
    /** City/place name Open-Meteo's paired AQI lookup resolved, used as a
     *  fallback location label when the map click didn't land on a named
     *  boundary feature. Not part of CurrentWeather itself. */
    resolvedCityLabel: string | null;
  }>;
}

export interface ForecastWeatherProvider {
  getForecast(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherForecast>;
}

/** Normalizes one `LocationSummaryResponse` into independent `current` and
 *  `aqi` slices. Both come from the same HTTP call (no new request budget
 *  is spent splitting them), but each has its own availability status
 *  drawn straight from that response's own per-section status, so one being
 *  UNAVAILABLE never blocks the other from rendering. */
function normalizeCurrentAndAqi(summary: LocationSummaryResponse | null) {
  const weather = summary?.weather.status === "AVAILABLE" ? summary.weather.data : null;
  const current: CurrentWeather | null = weather
    ? {
        source: weather.source,
        // Open-Meteo's "current" endpoint is a modeled nowcast, not a real
        // station observation - never claim otherwise (see research task).
        sourceType: "modeled-current",
        stationName: null,
        stationDistanceKm: null,
        observedAt: weather.observationTime,
        temperatureC: weather.temperatureC,
        feelsLikeC: weather.feelsLikeC,
        humidityPct: weather.relativeHumidityPercent,
        pressureHpa: weather.surfacePressureHpa,
        rainMm: weather.rainMm,
        windSpeedKmh: weather.windSpeedKmh,
        windDirectionDeg: weather.windDirectionDegrees,
        windDirectionText: weather.windDirectionCompass,
        weatherCode: weather.weatherCode,
        isDay: weather.isDay,
      }
    : null;

  const official = summary?.officialAirQuality.status === "AVAILABLE" ? summary.officialAirQuality.data : null;
  const modeled = summary?.modeledAirQuality.status === "AVAILABLE" ? summary.modeledAirQuality.data : null;
  const distanceKm = summary?.officialAirQuality.status === "AVAILABLE" ? summary.officialAirQuality.distanceKm : null;

  const resolvedCityLabel = official?.city?.trim() || null;

  return { current, aqi: { official, modeled, distanceKm }, resolvedCityLabel };
}

export const openMeteoCurrentProvider: CurrentWeatherProvider = {
  async getCurrent(lat, lon, signal) {
    const summary = await fetchLocationSummary(lat, lon, signal);
    return normalizeCurrentAndAqi(summary);
  },
};

export const openMeteoForecastProvider: ForecastWeatherProvider = {
  async getForecast(lat, lon, signal) {
    const [dailyResult, hourlyResult] = await Promise.allSettled([
      fetchDailyForecast(lat, lon, signal),
      fetchHourlyForecast(lat, lon, signal),
    ]);
    const daily = dailyResult.status === "fulfilled" ? dailyResult.value : null;
    const hourly = hourlyResult.status === "fulfilled" ? hourlyResult.value : null;
    if (!daily && !hourly) {
      throw new Error("Open-Meteo forecast unavailable");
    }

    const hourlyPoints: HourlyForecastNormalized[] = (hourly?.points ?? []).map((p) => ({
      time: p.time,
      temperatureC: p.temperatureC,
      feelsLikeC: null, // Open-Meteo's hourly endpoint doesn't return this
      rainProbabilityPct: p.precipitationProbabilityPercent,
      rainMm: p.precipitationMm,
      humidityPct: null, // not in HourlyForecastResponse today
      cloudCoverPct: null, // not in HourlyForecastResponse today
      windSpeedKmh: p.windSpeedKmh,
      windDirectionDeg: p.windDirectionDegrees,
      windDirectionText: p.windDirectionCompass,
      weatherCode: p.weatherCode,
      isDay: p.isDay,
    }));

    const dailyPoints: DailyForecastNormalized[] = (daily?.days ?? []).map((d) => ({
      date: d.date,
      temperatureMaxC: d.temperatureMaxC,
      temperatureMinC: d.temperatureMinC,
      rainProbabilityPct: d.precipitationProbabilityMax,
      rainMm: d.precipitationSumMm,
      weatherCode: d.weatherCode,
    }));

    return {
      source: (daily ?? hourly)!.source,
      sourceType: "forecast",
      generatedAt: (daily ?? hourly)!.fetchedAt,
      // Open-Meteo resolves the exact requested lat/lon (no grid snapping to
      // expose) - left null rather than fabricated. A future MausamGram
      // provider would populate these with its actual resolved grid point.
      gridLat: null,
      gridLon: null,
      spatialResolutionKm: null,
      hourly: hourlyPoints,
      daily: dailyPoints,
    };
  },
};
