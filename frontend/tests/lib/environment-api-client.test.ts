import {
  ApiUnavailableError,
  fetchAirQuality,
  fetchCurrentEnvironment,
  fetchDailyForecast,
  fetchWeather,
} from "@/lib/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

describe("fetchWeather", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps snake_case fields to camelCase", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        latitude: 12.9716,
        longitude: 77.5946,
        temperature_c: 28.4,
        relative_humidity_percent: 67,
        precipitation_mm: 0,
        rain_mm: 0,
        wind_speed_kmh: 9.4,
        wind_direction_degrees: 225,
        wind_direction_compass: "SW",
        surface_pressure_hpa: 912,
        observation_time: "2026-08-12T12:10:00+05:30",
        source: "Open-Meteo",
        data_status: "LIVE",
        fetched_at: "2026-08-12T06:40:00Z",
      }),
    );

    const result = await fetchWeather(12.9716, 77.5946);
    expect(result.temperatureC).toBe(28.4);
    expect(result.windDirectionCompass).toBe("SW");
    expect(result.dataStatus).toBe("LIVE");
    expect(result.source).toBe("Open-Meteo");
  });

  it("throws ApiUnavailableError when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(fetchWeather(12.97, 77.59)).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("passes the given coordinates through as query params, never hardcoding a location", async () => {
    const fetchMock = mockJsonResponse({
      latitude: 15.3,
      longitude: 75.7,
      temperature_c: 25,
      relative_humidity_percent: 50,
      precipitation_mm: 0,
      rain_mm: 0,
      wind_speed_kmh: 5,
      wind_direction_degrees: 90,
      wind_direction_compass: "E",
      surface_pressure_hpa: 900,
      observation_time: null,
      source: "Open-Meteo",
      data_status: "LIVE",
      fetched_at: "2026-08-12T06:40:00Z",
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWeather(15.3, 75.7);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("latitude=15.3");
    expect(calledUrl).toContain("longitude=75.7");
  });
});

describe("fetchAirQuality", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps us_aqi and european_aqi explicit — never relabels them", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        latitude: 12.97,
        longitude: 77.59,
        pm10: 12.4,
        pm2_5: 7.1,
        co: 236,
        no2: 5.9,
        so2: 3.8,
        o3: 52,
        us_aqi: 48,
        european_aqi: 21,
        observation_time: "2026-08-12T11:30:00+05:30",
        source: "Open-Meteo",
        source_type: "MODELED",
        data_status: "LIVE",
        fetched_at: "2026-08-12T06:40:00Z",
      }),
    );

    const result = await fetchAirQuality(12.97, 77.59);
    expect(result.usAqi).toBe(48);
    expect(result.europeanAqi).toBe(21);
    expect(result.sourceType).toBe("MODELED");
  });
});

describe("fetchCurrentEnvironment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves independent AVAILABLE/UNAVAILABLE status per section", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        latitude: 12.97,
        longitude: 77.59,
        weather: { status: "AVAILABLE", data: null, data_status: "LIVE", fetched_at: null, message: null },
        modeled_air_quality: {
          status: "UNAVAILABLE",
          data: null,
          data_status: null,
          fetched_at: null,
          message: "Modeled air-quality information is temporarily unavailable.",
        },
      }),
    );

    const result = await fetchCurrentEnvironment(12.97, 77.59);
    expect(result.weather.status).toBe("AVAILABLE");
    expect(result.modeledAirQuality.status).toBe("UNAVAILABLE");
    expect(result.modeledAirQuality.message).toMatch(/temporarily unavailable/);
  });
});

describe("fetchDailyForecast", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps daily forecast arrays into frontend-friendly day objects", async () => {
    vi.stubGlobal(
      "fetch",
      mockJsonResponse({
        latitude: 12.97,
        longitude: 77.59,
        source: "Open-Meteo",
        data_status: "LIVE",
        fetched_at: "2026-08-12T06:40:00Z",
        days: [
          {
            date: "2026-08-12",
            weather_code: 3,
            temperature_max_c: 28.4,
            temperature_min_c: 20.1,
            precipitation_sum_mm: 0,
            precipitation_probability_max: 10,
            wind_speed_max_kmh: 18,
          },
        ],
      }),
    );

    const result = await fetchDailyForecast(12.97, 77.59);
    expect(result.source).toBe("Open-Meteo");
    expect(result.days[0]?.weatherCode).toBe(3);
    expect(result.days[0]?.temperatureMaxC).toBe(28.4);
    expect(result.days[0]?.precipitationProbabilityMax).toBe(10);
  });
});
