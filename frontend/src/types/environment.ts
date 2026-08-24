/**
 * Live weather + air quality domain types.
 *
 * `CpcbStation` (measured) and `ModeledAirQuality` (modeled) are kept as
 * distinct types on purpose — never merge a CPCB monitoring-station
 * reading with an Open-Meteo modeled estimate into one shape.
 */

export type DataStatus = "LIVE" | "STALE";
export type SectionAvailability = "AVAILABLE" | "UNAVAILABLE";
export type AqiSource = "SOURCE_CPCB" | "CALCULATED_CPCB" | "NOT_AVAILABLE";
export type AqiCategory = "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

/**
 * Weather Details panel state — architecture only, see docs at the bottom of
 * this file. `current`, `forecast`, and `aqi` are independent pipelines: each
 * carries its own status and never overwrites another's data. A location
 * click always resolves through TWO provider families (current weather,
 * forecast weather) plus AQI, all normalized to source-agnostic shapes below
 * so the UI never branches on which provider is behind them - see
 * lib/weather/weatherPipelines.ts. Today both current and forecast are
 * populated by Open-Meteo; swapping either provider (e.g. current -> IMD
 * AWS, forecast -> IMD MausamGram) only touches that adapter file.
 */
export type PipelineStatus = "idle" | "loading" | "success" | "error";

/** The user's exact clicked/selected coordinate. Never replaced by a
 *  provider's resolved grid point - see WeatherForecast.gridLat/gridLon. */
export interface WeatherLocationSelection {
  latitude: number;
  longitude: number;
  locationLabel: string | null;
}

export type WeatherPanelState =
  | { status: "idle" }
  | {
      status: "active";
      /** Bumped on every new location selection; a pipeline only applies a
       *  response if it's still the generation that requested it - guards
       *  against a slow, superseded fetch overwriting a newer selection. */
      generation: number;
      location: WeatherLocationSelection;
      current: { status: PipelineStatus; data: CurrentWeather | null };
      forecast: { status: PipelineStatus; data: WeatherForecast | null };
      aqi: {
        status: PipelineStatus;
        official: CpcbStation | null;
        modeled: ModeledAirQuality | null;
        distanceKm: number | null;
      };
    };

/** Normalized current-conditions shape, provider-agnostic. Open-Meteo today;
 *  a future IMD AWS/current_wx adapter would populate `stationName` /
 *  `stationDistanceKm` and set `sourceType: "observation"`. */
export interface CurrentWeather {
  source: string;
  sourceType: "observation" | "modeled-current";
  stationName: string | null;
  stationDistanceKm: number | null;
  observedAt: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  rainMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windDirectionText: string | null;
  /** Open-Meteo WMO weather code - drives the existing condition icon/label. */
  weatherCode: number | null;
  /** Selects day/night icon variants - kept alongside weatherCode rather
   *  than computed, since the source data already carries it per-point. */
  isDay: boolean | null;
}

/** Normalized single forecast point, provider-agnostic. */
export interface HourlyForecastNormalized {
  time: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  rainProbabilityPct: number | null;
  rainMm: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windDirectionText: string | null;
  weatherCode: number | null;
  isDay: boolean | null;
}

export interface DailyForecastNormalized {
  date: string;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  rainProbabilityPct: number | null;
  rainMm: number | null;
  weatherCode: number | null;
}

/** Normalized forecast shape, provider-agnostic. Open-Meteo today; a future
 *  IMD MausamGram adapter would populate `gridLat`/`gridLon`/
 *  `spatialResolutionKm` (its ~12x12 km grid) - the selected location itself
 *  (WeatherLocationSelection) stays exact and is never replaced by these. */
export interface WeatherForecast {
  source: string;
  sourceType: "forecast";
  generatedAt: string | null;
  /** The provider's resolved grid point, when it differs from the exact
   *  selected coordinate (e.g. MausamGram's 0.125° grid snapping). Null for
   *  providers (like Open-Meteo here) that don't expose/need this. */
  gridLat: number | null;
  gridLon: number | null;
  spatialResolutionKm: number | null;
  hourly: HourlyForecastNormalized[];
  daily: DailyForecastNormalized[];
}

export interface WeatherObservation {
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  feelsLikeC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windDirectionCompass: string | null;
  surfacePressureHpa: number | null;
  observationTime: string | null;
  /** Open-Meteo WMO weather code (see lib/weather/weatherCondition.ts) - drives the condition icon/label. */
  weatherCode: number | null;
  /** Whether `observationTime` falls in daytime at this location - selects day/night icon variants. */
  isDay: boolean | null;
  source: "Open-Meteo";
}

export interface WeatherResponse extends WeatherObservation {
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface HourlyForecastPoint {
  time: string;
  temperatureC: number | null;
  precipitationProbabilityPercent: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windDirectionCompass: string | null;
  weatherCode: number | null;
  isDay: boolean | null;
}

export interface HourlyForecastResponse {
  latitude: number;
  longitude: number;
  points: HourlyForecastPoint[];
  source: "Open-Meteo";
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface DailyForecastDay {
  date: string;
  weatherCode: number | null;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  precipitationSumMm: number | null;
  precipitationProbabilityMax: number | null;
  windSpeedMaxKmh: number | null;
}

export interface DailyForecastResponse {
  latitude: number;
  longitude: number;
  days: DailyForecastDay[];
  source: "Open-Meteo";
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface GfsWindBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GfsWindFrameResponse {
  source: "NOAA GFS";
  model: "GFS 0.25°";
  runTime: string;
  forecastTime: string;
  forecastHour: number;
  bounds: GfsWindBounds;
  width: number;
  height: number;
  dx: number;
  dy: number;
  latitudes: number[];
  longitudes: number[];
  u: number[];
  v: number[];
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface GfsWeatherFieldFrameResponse {
  source: "NOAA GFS";
  model: "GFS 0.25°";
  variable: "temperature" | "precipitation" | "clouds" | "pressure";
  runTime: string;
  forecastTime: string;
  forecastHour: number;
  bounds: GfsWindBounds;
  width: number;
  height: number;
  dx: number;
  dy: number;
  latitudes: number[];
  longitudes: number[];
  unit: string;
  values: number[];
  dataStatus: DataStatus;
  fetchedAt: string;
}

/** One NASA FIRMS active-fire detection, normalized server-side from the Area API CSV. */
export interface FireDetection {
  lat: number;
  lon: number;
  brightness: number | null;
  brightTi5: number | null;
  /** 0-100. VIIRS categorical low/nominal/high confidence is mapped to 25/60/95 server-side. */
  confidence: number | null;
  /** Fire Radiative Power (MW), when reported. */
  frp: number | null;
  scan: number | null;
  track: number | null;
  version: string | null;
  acquiredAt: string;
  satellite: string;
  instrument: string;
  dayNight: "day" | "night";
}

export interface ModeledAirQuality {
  latitude: number;
  longitude: number;
  pm10: number | null;
  pm2_5: number | null;
  co: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  usAqi: number | null;
  europeanAqi: number | null;
  observationTime: string | null;
  source: "Open-Meteo";
  sourceType: "MODELED";
}

export interface AirQualityResponse extends ModeledAirQuality {
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface PollutantReading {
  min: number | null;
  avg: number | null;
  max: number | null;
}

export interface CpcbStation {
  stationId: string;
  station: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  lastUpdate: string | null;
  pollutants: Record<string, PollutantReading>;
  aqiValue: number | null;
  aqiCategory: AqiCategory | null;
  aqiSource: AqiSource;
  source: "CPCB / data.gov.in";
  sourceType: "MEASURED";
}

export interface WeatherSection {
  status: SectionAvailability;
  data: WeatherObservation | null;
  dataStatus: DataStatus | null;
  fetchedAt: string | null;
  message: string | null;
}

export interface ModeledAqiSection {
  status: SectionAvailability;
  data: ModeledAirQuality | null;
  dataStatus: DataStatus | null;
  fetchedAt: string | null;
  message: string | null;
}

export interface OfficialAqiSection {
  status: SectionAvailability;
  data: CpcbStation | null;
  distanceKm: number | null;
  dataStatus: DataStatus | null;
  fetchedAt: string | null;
  message: string | null;
}

export interface CurrentEnvironmentResponse {
  latitude: number;
  longitude: number;
  weather: WeatherSection;
  modeledAirQuality: ModeledAqiSection;
}

export interface LocationSummaryResponse {
  location: { latitude: number; longitude: number };
  weather: WeatherSection;
  officialAirQuality: OfficialAqiSection;
  modeledAirQuality: ModeledAqiSection;
  timestamps: Record<string, string | null>;
  sources: Record<string, string>;
}

export interface CpcbStationsResponse {
  count: number;
  dataStatus: DataStatus;
  fetchedAt: string;
  stations: CpcbStation[];
}

export interface CpcbSummaryResponse {
  state: string;
  stationCount: number;
  cityCount: number;
  categoryCounts: Record<string, number>;
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface AqiGridPoint {
  latitude: number;
  longitude: number;
  pm2_5: number | null;
  usAqi: number | null;
  dataStatus: DataStatus;
  fetchedAt: string;
}

export interface AqiGridResponse {
  bounds: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  points: AqiGridPoint[];
  source: "Open-Meteo";
  sourceType: "MODELED";
  dataStatus: DataStatus;
  fetchedAt: string;
}

/**
 * IMD district nowcast warnings — a fourth, independent domain alongside
 * current/forecast/AQI (see WeatherPanelState above). Sourced from IMD's own
 * public GeoServer WFS (`imd:NowcastWarningDistrict`) via the backend proxy
 * at /api/v1/environment/imd/warnings - never overwrites current weather,
 * forecast, or AQI, and is fetched independently of all three (see
 * lib/weather/imdWarnings.ts).
 */
export type ImdWarningSeverity = "GREEN" | "YELLOW" | "ORANGE" | "RED";

export interface ImdWarningProperties {
  id: string;
  source: "IMD";
  areaName: string | null;
  state: string | null;
  meteorologicalCentre: string | null;
  /** Null when the source's numeric code doesn't map to IMD's documented
   *  4-tier scale (e.g. an unrecognized future code) - never guessed. */
  severity: ImdWarningSeverity | null;
  /** The source's raw 1-4 (or other) code `severity` was derived from. */
  severityCode: number | null;
  category: "NOWCAST";
  /** IMD's own free-text nowcast message, when populated (empty for most
   *  routine/no-warning districts - never fabricated). */
  description: string | null;
  impact: string | null;
  action: string | null;
  /** ISO 8601 IST timestamps, combined server-side from the source's date +
   *  bare "HHMM" time-of-issue/valid-until fields. */
  issuedAt: string | null;
  validUntil: string | null;
  /** Source's own last-refresh timestamp (ISO 8601 UTC), verbatim. */
  updatedAt: string | null;
}

export interface ImdWarningFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: ImdWarningProperties;
}

export interface ImdWarningsResponse {
  type: "FeatureCollection";
  features: ImdWarningFeature[];
}
