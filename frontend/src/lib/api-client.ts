import { config } from "@/lib/config";
import type {
  ApiErrorCode,
  LoginInput,
  LoginResult,
  PendingSignup,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisteredUser,
  VerifyEmailResult,
} from "@/types/auth";
import type {
  AirQualityResponse,
  AqiGridPoint,
  AqiGridResponse,
  CpcbStation,
  CpcbSummaryResponse,
  CurrentEnvironmentResponse,
  DailyForecastDay,
  DailyForecastResponse,
  FireDetection,
  GfsWeatherFieldFrameResponse,
  GfsWindFrameResponse,
  GeoJsonFeatureCollection,
  HourlyForecastPoint,
  HourlyForecastResponse,
  ImdWarningsResponse,
  LocationSummaryResponse,
  ModeledAirQuality,
  ModeledAqiSection,
  OfficialAqiSection,
  PollutantReading,
  WeatherObservation,
  WeatherResponse,
  WeatherSection,
} from "@/types/environment";
import type { AggregatedHealthResponse } from "@/types/health";

export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Naksha GeoSphere API is unavailable");
    this.name = "ApiUnavailableError";
    this.cause = cause;
  }
}

/**
 * A request the API reached and rejected (4xx/5xx with a structured error
 * body) — as opposed to `ApiUnavailableError`, which means the API could
 * not be reached at all. Carries the backend's `error_code` so callers can
 * branch on it without parsing message text.
 */
export class ApiRequestError extends Error {
  readonly errorCode: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(
    errorCode: ApiErrorCode,
    message: string,
    status: number,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.errorCode = errorCode;
    this.status = status;
    this.fields = fields;
  }
}

interface RawErrorBody {
  error_code?: string;
  message?: string;
  fields?: Record<string, string>;
  detail?: string;
}

async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  let body: RawErrorBody = {};
  try {
    body = (await response.json()) as RawErrorBody;
  } catch {
    // Non-JSON error body — fall back to a generic message below.
  }
  const errorCode = (body.error_code as ApiErrorCode | undefined) ?? "UNKNOWN_ERROR";
  const message = body.message ?? body.detail ?? "The request could not be completed.";
  return new ApiRequestError(errorCode, message, response.status, body.fields);
}

interface RawServiceHealth {
  status: "healthy" | "degraded" | "unavailable";
  detail: string;
  latency_ms?: number;
}

interface RawAggregatedHealth {
  status: "healthy" | "degraded" | "unavailable";
  timestamp: string;
  version: string;
  environment: string;
  services: {
    database: RawServiceHealth;
    redis: RawServiceHealth;
    object_storage: RawServiceHealth;
  };
}

/**
 * Fetches the aggregated platform health snapshot from the API.
 * Never throws for a reachable-but-unhealthy API (the backend encodes that
 * in the response body); only throws when the API cannot be reached at all,
 * so callers can render a distinct "API unavailable" state.
 */
export async function fetchPlatformHealth(signal?: AbortSignal): Promise<AggregatedHealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok && response.status >= 500) {
    // Server reached but failing hard — still surface as unavailable.
    throw new ApiUnavailableError(new Error(`HTTP ${response.status}`));
  }

  const raw = (await response.json()) as RawAggregatedHealth;

  return {
    status: raw.status,
    timestamp: raw.timestamp,
    version: raw.version,
    environment: raw.environment,
    services: {
      database: {
        status: raw.services.database.status,
        detail: raw.services.database.detail,
        latencyMs: raw.services.database.latency_ms,
      },
      redis: {
        status: raw.services.redis.status,
        detail: raw.services.redis.detail,
        latencyMs: raw.services.redis.latency_ms,
      },
      objectStorage: {
        status: raw.services.object_storage.status,
        detail: raw.services.object_storage.detail,
        latencyMs: raw.services.object_storage.latency_ms,
      },
    },
  };
}

// Pre-verification shape: `/auth/register` returns only full_name + email
// (see `PendingSignup`); no users row exists until email verification.
interface RawRegisterResponse {
  user: { full_name: string; email: string };
  next_step: "verify_email";
  message: string;
}

/**
 * Submits the signup form. Throws `ApiRequestError` for any 4xx/5xx
 * response (duplicate email, validation failure, rate limit, etc.) and
 * `ApiUnavailableError` if the API can't be reached at all — never
 * resolves successfully unless the account was actually created.
 */
export async function registerAccount(
  input: RegisterAccountInput,
  signal?: AbortSignal,
): Promise<RegisterAccountResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: input.fullName,
        email: input.email,
        organization_name: input.organizationName,
        role_or_use_case: input.roleOrUseCase,
        password: input.password,
        confirm_password: input.confirmPassword,
        accepted_terms: input.acceptedTerms,
      }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as RawRegisterResponse;

  return {
    user: {
      fullName: raw.user.full_name,
      email: raw.user.email,
    } as PendingSignup,
    nextStep: raw.next_step,
    message: raw.message,
  };
}

interface RawVerifyEmailResponse {
  status: "active";
  message: string;
  user: RawUser;
}

export async function verifyEmail(
  input: { email: string; code: string },
  signal?: AbortSignal,
): Promise<VerifyEmailResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, code: input.code }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as RawVerifyEmailResponse;

  return {
    status: raw.status,
    message: raw.message,
    user: toRegisteredUser(raw.user),
  };
}

interface RawUser {
  id: string;
  full_name: string;
  email: string;
  organization_name: string | null;
  role_or_use_case: string | null;
  status: string;
  created_at: string;
}

function toRegisteredUser(raw: RawUser): RegisteredUser {
  return {
    id: raw.id,
    fullName: raw.full_name,
    email: raw.email,
    organizationName: raw.organization_name,
    roleOrUseCase: raw.role_or_use_case,
    status: raw.status as RegisteredUser["status"],
    createdAt: raw.created_at,
  };
}

/**
 * Authenticates email + password against the API and resolves with the
 * signed-in user. Throws `ApiRequestError` (INVALID_CREDENTIALS /
 * EMAIL_NOT_VERIFIED / …) or `ApiUnavailableError`.
 */
export async function login(
  input: LoginInput,
  signal?: AbortSignal,
): Promise<LoginResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as { user: RawUser; message: string };
  return {
    user: toRegisteredUser(raw.user),
    message: raw.message,
  };
}

/**
 * Swaps the single-use ticket from an OAuth callback (Google, GitHub, …)
 * for the signed-in user. Throws `ApiRequestError` (GOOGLE_SESSION_INVALID
 * / …) or `ApiUnavailableError`.
 */
export async function completeOAuthSignup(
  ticket: string,
  signal?: AbortSignal,
): Promise<LoginResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/oauth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as { user: RawUser; message: string };
  return {
    user: toRegisteredUser(raw.user),
    message: raw.message,
  };
}

export async function resendVerificationEmail(
  email: string,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  return (await response.json()) as { message: string };
}

// --- Environment: live weather + air quality --------------------------
//
// All three provider integrations (CPCB/data.gov.in, Open-Meteo weather,
// Open-Meteo air quality) are called through our backend — never directly
// from the browser — so the CPCB API key never reaches the frontend.

interface RawWeatherObservation {
  latitude: number;
  longitude: number;
  temperature_c: number | null;
  feels_like_c: number | null;
  relative_humidity_percent: number | null;
  precipitation_mm: number | null;
  rain_mm: number | null;
  wind_speed_kmh: number | null;
  wind_direction_degrees: number | null;
  wind_direction_compass: string | null;
  surface_pressure_hpa: number | null;
  observation_time: string | null;
  weather_code: number | null;
  is_day: boolean | null;
  source: "Open-Meteo";
}

interface RawWeatherResponse extends RawWeatherObservation {
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawHourlyForecastPoint {
  time: string;
  temperature_c: number | null;
  precipitation_probability_percent: number | null;
  precipitation_mm: number | null;
  wind_speed_kmh: number | null;
  wind_direction_degrees: number | null;
  wind_direction_compass: string | null;
  weather_code: number | null;
  is_day: boolean | null;
}

interface RawHourlyForecastResponse {
  latitude: number;
  longitude: number;
  points: RawHourlyForecastPoint[];
  source: "Open-Meteo";
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawDailyForecastDay {
  date: string;
  weather_code: number | null;
  temperature_max_c: number | null;
  temperature_min_c: number | null;
  precipitation_sum_mm: number | null;
  precipitation_probability_max: number | null;
  wind_speed_max_kmh: number | null;
}

interface RawDailyForecastResponse {
  latitude: number;
  longitude: number;
  days: RawDailyForecastDay[];
  source: "Open-Meteo";
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawGfsWindBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

interface RawGfsWindFrameResponse {
  source: "NOAA GFS";
  model: "GFS 0.25°";
  run_time: string;
  forecast_time: string;
  forecast_hour: number;
  bounds: RawGfsWindBounds;
  width: number;
  height: number;
  dx: number;
  dy: number;
  latitudes: number[];
  longitudes: number[];
  u: number[];
  v: number[];
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawModeledAirQuality {
  latitude: number;
  longitude: number;
  pm10: number | null;
  pm2_5: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  us_aqi: number | null;
  european_aqi: number | null;
  observation_time: string | null;
  source: "Open-Meteo";
  source_type: "MODELED";
}

interface RawAirQualityResponse extends RawModeledAirQuality {
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawCpcbStation {
  station_id: string;
  station: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  last_update: string | null;
  pollutants: Record<string, PollutantReading>;
  aqi_value: number | null;
  aqi_category: CpcbStation["aqiCategory"];
  aqi_source: CpcbStation["aqiSource"];
  source: "CPCB / data.gov.in";
  source_type: "MEASURED";
}

interface RawWeatherSection {
  status: "AVAILABLE" | "UNAVAILABLE";
  data: RawWeatherObservation | null;
  data_status: "LIVE" | "STALE" | null;
  fetched_at: string | null;
  message: string | null;
}

interface RawModeledAqiSection {
  status: "AVAILABLE" | "UNAVAILABLE";
  data: RawModeledAirQuality | null;
  data_status: "LIVE" | "STALE" | null;
  fetched_at: string | null;
  message: string | null;
}

interface RawOfficialAqiSection {
  status: "AVAILABLE" | "UNAVAILABLE";
  data: RawCpcbStation | null;
  distance_km: number | null;
  data_status: "LIVE" | "STALE" | null;
  fetched_at: string | null;
  message: string | null;
}

function mapWeatherObservation(raw: RawWeatherObservation): WeatherObservation {
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    temperatureC: raw.temperature_c,
    feelsLikeC: raw.feels_like_c,
    relativeHumidityPercent: raw.relative_humidity_percent,
    precipitationMm: raw.precipitation_mm,
    rainMm: raw.rain_mm,
    windSpeedKmh: raw.wind_speed_kmh,
    windDirectionDegrees: raw.wind_direction_degrees,
    windDirectionCompass: raw.wind_direction_compass,
    surfacePressureHpa: raw.surface_pressure_hpa,
    observationTime: raw.observation_time,
    weatherCode: raw.weather_code,
    isDay: raw.is_day,
    source: raw.source,
  };
}

function mapHourlyForecastPoint(raw: RawHourlyForecastPoint): HourlyForecastPoint {
  return {
    time: raw.time,
    temperatureC: raw.temperature_c,
    precipitationProbabilityPercent: raw.precipitation_probability_percent,
    precipitationMm: raw.precipitation_mm,
    windSpeedKmh: raw.wind_speed_kmh,
    windDirectionDegrees: raw.wind_direction_degrees,
    windDirectionCompass: raw.wind_direction_compass,
    weatherCode: raw.weather_code,
    isDay: raw.is_day,
  };
}

function mapDailyForecastDay(raw: RawDailyForecastDay): DailyForecastDay {
  return {
    date: raw.date,
    weatherCode: raw.weather_code,
    temperatureMaxC: raw.temperature_max_c,
    temperatureMinC: raw.temperature_min_c,
    precipitationSumMm: raw.precipitation_sum_mm,
    precipitationProbabilityMax: raw.precipitation_probability_max,
    windSpeedMaxKmh: raw.wind_speed_max_kmh,
  };
}

function mapModeledAirQuality(raw: RawModeledAirQuality): ModeledAirQuality {
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    pm10: raw.pm10,
    pm2_5: raw.pm2_5,
    co: raw.co,
    no2: raw.no2,
    so2: raw.so2,
    o3: raw.o3,
    usAqi: raw.us_aqi,
    europeanAqi: raw.european_aqi,
    observationTime: raw.observation_time,
    source: raw.source,
    sourceType: raw.source_type,
  };
}

function mapCpcbStation(raw: RawCpcbStation): CpcbStation {
  return {
    stationId: raw.station_id,
    station: raw.station,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    latitude: raw.latitude,
    longitude: raw.longitude,
    lastUpdate: raw.last_update,
    pollutants: raw.pollutants,
    aqiValue: raw.aqi_value,
    aqiCategory: raw.aqi_category,
    aqiSource: raw.aqi_source,
    source: raw.source,
    sourceType: raw.source_type,
  };
}

function mapWeatherSection(raw: RawWeatherSection): WeatherSection {
  return {
    status: raw.status,
    data: raw.data ? mapWeatherObservation(raw.data) : null,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
    message: raw.message,
  };
}

function mapModeledAqiSection(raw: RawModeledAqiSection): ModeledAqiSection {
  return {
    status: raw.status,
    data: raw.data ? mapModeledAirQuality(raw.data) : null,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
    message: raw.message,
  };
}

function mapOfficialAqiSection(raw: RawOfficialAqiSection): OfficialAqiSection {
  return {
    status: raw.status,
    data: raw.data ? mapCpcbStation(raw.data) : null,
    distanceKm: raw.distance_km,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
    message: raw.message,
  };
}

async function environmentGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, { method: "GET", cache: "no-store", signal });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }
    throw new ApiUnavailableError(error);
  }
  if (!response.ok) {
    throw await toApiRequestError(response);
  }
  return (await response.json()) as T;
}

/** Current weather for an arbitrary coordinate (Open-Meteo, via our backend). */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<WeatherResponse> {
  const raw = await environmentGet<RawWeatherResponse>(
    `/api/v1/environment/weather?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return { ...mapWeatherObservation(raw), dataStatus: raw.data_status, fetchedAt: raw.fetched_at };
}

function mapGfsWindFrame(raw: RawGfsWindFrameResponse): GfsWindFrameResponse {
  return {
    source: raw.source,
    model: raw.model,
    runTime: raw.run_time,
    forecastTime: raw.forecast_time,
    forecastHour: raw.forecast_hour,
    bounds: raw.bounds,
    width: raw.width,
    height: raw.height,
    dx: raw.dx,
    dy: raw.dy,
    latitudes: raw.latitudes,
    longitudes: raw.longitudes,
    u: raw.u,
    v: raw.v,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

/** Five-day daily forecast for an arbitrary coordinate (Open-Meteo). */
export async function fetchDailyForecast(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DailyForecastResponse> {
  const raw = await environmentGet<RawDailyForecastResponse>(
    `/api/v1/environment/daily-forecast?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    days: raw.days.map(mapDailyForecastDay),
    source: raw.source,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

/** Next-24-hour hourly forecast (temperature/precipitation/wind) for an arbitrary coordinate (Open-Meteo). */
export async function fetchHourlyForecast(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<HourlyForecastResponse> {
  const raw = await environmentGet<RawHourlyForecastResponse>(
    `/api/v1/environment/hourly-forecast?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    points: raw.points.map(mapHourlyForecastPoint),
    source: raw.source,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

/** Karnataka-canary NOAA GFS 0.25° 10m wind frame for one forecast hour. */
export async function fetchGfsWindFrame(
  forecastHour: number,
  signal?: AbortSignal,
): Promise<GfsWindFrameResponse> {
  const raw = await environmentGet<RawGfsWindFrameResponse>(
    `/api/v1/environment/weather-map/gfs/wind?forecast_hour=${forecastHour}`,
    signal
  );
  return mapGfsWindFrame(raw);
}

interface RawGfsWeatherFieldFrameResponse {
  source: "NOAA GFS";
  model: "GFS 0.25°";
  variable: "temperature" | "precipitation" | "clouds" | "pressure";
  run_time: string;
  forecast_time: string;
  forecast_hour: number;
  bounds: RawGfsWindBounds;
  width: number;
  height: number;
  dx: number;
  dy: number;
  latitudes: number[];
  longitudes: number[];
  unit: string;
  values: number[];
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

function mapGfsWeatherFieldFrame(raw: RawGfsWeatherFieldFrameResponse): GfsWeatherFieldFrameResponse {
  return {
    source: raw.source,
    model: raw.model,
    variable: raw.variable,
    runTime: raw.run_time,
    forecastTime: raw.forecast_time,
    forecastHour: raw.forecast_hour,
    bounds: raw.bounds,
    width: raw.width,
    height: raw.height,
    dx: raw.dx,
    dy: raw.dy,
    latitudes: raw.latitudes,
    longitudes: raw.longitudes,
    unit: raw.unit,
    values: raw.values,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

/** All-India NOAA GFS 0.25° scalar field (temperature / precipitation / clouds)
 * for one forecast hour, served from the unified weather-map pipeline. */
export async function fetchGfsWeatherFieldFrame(
  variable: "temperature" | "precipitation" | "clouds" | "pressure",
  forecastHour: number,
  signal?: AbortSignal,
): Promise<GfsWeatherFieldFrameResponse> {
  const raw = await environmentGet<RawGfsWeatherFieldFrameResponse>(
    `/api/v1/environment/weather-map/gfs/${variable}?forecast_hour=${forecastHour}`,
    signal
  );
  return mapGfsWeatherFieldFrame(raw);
}

interface RawFireDetection {
  lat: number;
  lon: number;
  brightness: number | null;
  bright_ti5: number | null;
  confidence: number | null;
  frp: number | null;
  scan: number | null;
  track: number | null;
  version: string | null;
  acquired_at: string;
  satellite: string;
  instrument: string;
  day_night: "day" | "night";
}

/** NASA FIRMS active-fire detections within `hours` of now, in a bounding box
 * around (latitude, longitude). Routed through the backend so the FIRMS
 * MAP_KEY never reaches the browser. */
export async function fetchFireDetections(
  latitude: number,
  longitude: number,
  hours = 24,
  signal?: AbortSignal,
): Promise<FireDetection[]> {
  const raw = await environmentGet<RawFireDetection[]>(
    `/api/v1/environment/fire/?lat=${latitude}&lon=${longitude}&hours=${hours}`,
    signal,
  );
  return raw.map((d) => ({
    lat: d.lat,
    lon: d.lon,
    brightness: d.brightness,
    brightTi5: d.bright_ti5,
    confidence: d.confidence,
    frp: d.frp,
    scan: d.scan,
    track: d.track,
    version: d.version,
    acquiredAt: d.acquired_at,
    satellite: d.satellite,
    instrument: d.instrument,
    dayNight: d.day_night,
  }));
}

/** Modeled/gridded air quality for an arbitrary coordinate (Open-Meteo). Never
 * a substitute for an official CPCB station reading. */
export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<AirQualityResponse> {
  const raw = await environmentGet<RawAirQualityResponse>(
    `/api/v1/environment/air-quality?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return {
    ...mapModeledAirQuality(raw),
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

interface RawCurrentEnvironmentResponse {
  latitude: number;
  longitude: number;
  weather: RawWeatherSection;
  modeled_air_quality: RawModeledAqiSection;
}

/** Aggregated Open-Meteo weather + modeled air quality. Each section
 * reports AVAILABLE/UNAVAILABLE independently. */
export async function fetchCurrentEnvironment(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentEnvironmentResponse> {
  const raw = await environmentGet<RawCurrentEnvironmentResponse>(
    `/api/v1/environment/current?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return {
    latitude: raw.latitude,
    longitude: raw.longitude,
    weather: mapWeatherSection(raw.weather),
    modeledAirQuality: mapModeledAqiSection(raw.modeled_air_quality),
  };
}

interface RawLocationSummaryResponse {
  location: { latitude: number; longitude: number };
  weather: RawWeatherSection;
  official_air_quality: RawOfficialAqiSection;
  modeled_air_quality: RawModeledAqiSection;
  timestamps: Record<string, string | null>;
  sources: Record<string, string>;
}

/** Consolidated weather + nearest official CPCB station + modeled air
 * quality for a coordinate — the full "environment panel" for a location. */
export async function fetchLocationSummary(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<LocationSummaryResponse> {
  const raw = await environmentGet<RawLocationSummaryResponse>(
    `/api/v1/environment/location-summary?latitude=${latitude}&longitude=${longitude}`,
    signal,
  );
  return {
    location: raw.location,
    weather: mapWeatherSection(raw.weather),
    officialAirQuality: mapOfficialAqiSection(raw.official_air_quality),
    modeledAirQuality: mapModeledAqiSection(raw.modeled_air_quality),
    timestamps: raw.timestamps,
    sources: raw.sources,
  };
}

/** CPCB Karnataka AQI monitoring stations as a GeoJSON FeatureCollection —
 * one Point feature per physical station. */
export async function fetchAqiStationsGeoJson(
  signal?: AbortSignal,
): Promise<GeoJsonFeatureCollection> {
  return environmentGet<GeoJsonFeatureCollection>("/api/v1/environment/aqi/geojson", signal);
}

/** All-India (national) official CPCB AQI monitoring stations as a GeoJSON
 * FeatureCollection — one Point feature per physical station across India. */
export async function fetchNationalAqiStationsGeoJson(
  signal?: AbortSignal,
): Promise<GeoJsonFeatureCollection> {
  return environmentGet<GeoJsonFeatureCollection>("/api/v1/environment/aqi/national/geojson", signal);
}

/** Current IMD district nowcast warnings (all of India), as a GeoJSON
 * FeatureCollection whose properties are already normalized server-side
 * (see services/api/app/modules/environment/imd_warnings.py) - no raw/camelCase
 * mapping needed here, unlike most other endpoints in this file. */
export async function fetchImdWarnings(signal?: AbortSignal): Promise<ImdWarningsResponse> {
  return environmentGet<ImdWarningsResponse>("/api/v1/environment/imd/warnings/", signal);
}

interface RawAqiGridPoint {
  latitude: number;
  longitude: number;
  pm2_5: number | null;
  us_aqi: number | null;
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

interface RawAqiGridResponse {
  bounds: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  points: RawAqiGridPoint[];
  source: "Open-Meteo";
  source_type: "MODELED";
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

/** Modeled Open-Meteo air-quality surface (pm2.5 + US AQI) over a regular
 * ~1° grid covering the all-India domain. MODELED data — never a substitute
 * for official CPCB station readings. */
export async function fetchAqiGrid(signal?: AbortSignal): Promise<AqiGridResponse> {
  const raw = await environmentGet<RawAqiGridResponse>(
    "/api/v1/environment/aqi/grid",
    signal,
  );
  return {
    bounds: raw.bounds,
    width: raw.width,
    height: raw.height,
    points: raw.points.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      pm2_5: p.pm2_5,
      usAqi: p.us_aqi,
      dataStatus: p.data_status,
      fetchedAt: p.fetched_at,
    })),
    source: raw.source,
    sourceType: raw.source_type,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}

interface RawCpcbSummaryResponse {
  state: string;
  station_count: number;
  city_count: number;
  category_counts: Record<string, number>;
  data_status: "LIVE" | "STALE";
  fetched_at: string;
}

/** Karnataka-wide CPCB AQI summary (station/city counts, category breakdown). */
export async function fetchAqiSummary(signal?: AbortSignal): Promise<CpcbSummaryResponse> {
  const raw = await environmentGet<RawCpcbSummaryResponse>(
    "/api/v1/environment/aqi/summary",
    signal,
  );
  return {
    state: raw.state,
    stationCount: raw.station_count,
    cityCount: raw.city_count,
    categoryCounts: raw.category_counts,
    dataStatus: raw.data_status,
    fetchedAt: raw.fetched_at,
  };
}
