/**
 * Open-Meteo fallback weather service.
 *
 * Provides free weather data when the primary backend is unavailable.
 * Uses the Open-Meteo API (no API key required).
 */

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1";

export interface OpenMeteoCurrent {
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  precipitation: number | null;
  rain: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
  surface_pressure: number | null;
  weather_code: number | null;
  time: string;
}

export interface OpenMeteoDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
}

export interface OpenMeteoWeatherResponse {
  current: OpenMeteoCurrent;
  daily?: OpenMeteoDaily;
}

export interface OpenMeteoAqiCurrent {
  european_aqi: number | null;
  us_aqi: number | null;
  pm10: number | null;
  pm2_5: number | null;
  carbon_monoxide: number | null;
  nitrogen_dioxide: number | null;
  sulphur_dioxide: number | null;
  ozone: number | null;
  time: string;
}

export interface OpenMeteoAqiResponse {
  current: OpenMeteoAqiCurrent;
}

function compassDirection(degrees: number | null): string | null {
  if (degrees == null) return null;
  const dirs: string[] = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx] ?? null;
}

export async function fetchOpenMeteoWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<OpenMeteoWeatherResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "7",
  });

  const resp = await fetch(`${OPEN_METEO_BASE}/forecast?${params}`, { signal });
  if (!resp.ok) throw new Error(`Open-Meteo weather: ${resp.status}`);
  return resp.json();
}

export async function fetchOpenMeteoAqi(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<OpenMeteoAqiResponse> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone",
  });

  const resp = await fetch(`${OPEN_METEO_BASE}/air-quality?${params}`, { signal });
  if (!resp.ok) throw new Error(`Open-Meteo AQI: ${resp.status}`);
  return resp.json();
}

export function openMeteoToWeatherResponse(data: OpenMeteoWeatherResponse) {
  const c = data.current;
  return {
    latitude: 0,
    longitude: 0,
    temperatureC: c.temperature_2m,
    relativeHumidityPercent: c.relative_humidity_2m,
    precipitationMm: c.precipitation,
    rainMm: c.rain,
    windSpeedKmh: c.wind_speed_10m,
    windDirectionDegrees: c.wind_direction_10m,
    windDirectionCompass: compassDirection(c.wind_direction_10m),
    surfacePressureHpa: c.surface_pressure,
    observationTime: c.time,
    weatherCode: c.weather_code,
    source: "Open-Meteo" as const,
    dataStatus: "LIVE" as const,
    fetchedAt: new Date().toISOString(),
  };
}

export function openMeteoToDailyForecast(data: OpenMeteoWeatherResponse) {
  if (!data.daily) return [];
  const d = data.daily;
  return d.time.map((date, i) => ({
    date,
    weatherCode: d.weather_code[i] ?? null,
    temperatureMaxC: d.temperature_2m_max[i] ?? null,
    temperatureMinC: d.temperature_2m_min[i] ?? null,
    precipitationSumMm: d.precipitation_sum[i] ?? null,
    precipitationProbabilityMax: d.precipitation_probability_max[i] ?? null,
    windSpeedMaxKmh: d.wind_speed_10m_max[i] ?? null,
  }));
}

export function openMeteoToModeledAqi(data: OpenMeteoAqiResponse, lat: number, lng: number) {
  const c = data.current;
  return {
    latitude: lat,
    longitude: lng,
    pm10: c.pm10,
    pm2_5: c.pm2_5,
    co: c.carbon_monoxide,
    no2: c.nitrogen_dioxide,
    so2: c.sulphur_dioxide,
    o3: c.ozone,
    usAqi: c.us_aqi,
    europeanAqi: c.european_aqi,
    observationTime: c.time,
    source: "Open-Meteo" as const,
    sourceType: "MODELED" as const,
  };
}
