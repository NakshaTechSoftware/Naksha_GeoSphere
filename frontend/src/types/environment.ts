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

export interface WeatherObservation {
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  relativeHumidityPercent: number | null;
  precipitationMm: number | null;
  rainMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDegrees: number | null;
  windDirectionCompass: string | null;
  surfacePressureHpa: number | null;
  observationTime: string | null;
  source: "Open-Meteo";
}

export interface WeatherResponse extends WeatherObservation {
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
  variable: "temperature" | "precipitation" | "clouds";
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
