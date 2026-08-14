/**
 * Verifies the mandatory distinction between CPCB (measured) and
 * Open-Meteo (modeled) air quality is preserved in the rendered UI —
 * never merged into one figure or mislabeled (spec sections B/O/AD).
 */
import { ModeledAqiDetails } from "@/components/environment/ModeledAqiDetails";
import { OfficialAqiDetails } from "@/components/environment/OfficialAqiDetails";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CpcbStation, ModeledAirQuality } from "@/types/environment";

const station: CpcbStation = {
  stationId: "Bengaluru::Silk Board, Bengaluru - KSPCB",
  station: "Silk Board, Bengaluru - KSPCB",
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  latitude: 12.917348,
  longitude: 77.622813,
  lastUpdate: "2026-08-12T10:00:00+05:30",
  pollutants: { "PM2.5": { min: 90, avg: 101, max: 149 } },
  aqiValue: 83,
  aqiCategory: "Satisfactory",
  aqiSource: "CALCULATED_CPCB",
  source: "CPCB / data.gov.in",
  sourceType: "MEASURED",
};

const modeled: ModeledAirQuality = {
  latitude: 12.97,
  longitude: 77.59,
  pm10: 12.4,
  pm2_5: 7.1,
  co: 236,
  no2: 5.9,
  so2: 3.8,
  o3: 52,
  usAqi: 48,
  europeanAqi: 21,
  observationTime: "2026-08-12T11:30:00+05:30",
  source: "Open-Meteo",
  sourceType: "MODELED",
};

describe("official vs modeled air quality rendering", () => {
  it("labels the CPCB station as a measured monitoring-station reading", () => {
    render(<OfficialAqiDetails station={station} distanceKm={4.8} />);
    expect(screen.getByText(/Source: CPCB \/ data.gov.in/)).toBeInTheDocument();
    expect(screen.getByText(/Measured \(monitoring station\)/)).toBeInTheDocument();
    expect(screen.getByText("83")).toBeInTheDocument();
    expect(screen.getByText(/4.8 km away/)).toBeInTheDocument();
  });

  it("labels Open-Meteo data as modeled/gridded, keeping US AQI and European AQI explicit", () => {
    render(<ModeledAqiDetails airQuality={modeled} />);
    expect(screen.getByText(/Source: Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText(/Modeled \/ gridded/)).toBeInTheDocument();
    // Never relabeled as "Indian AQI" or "CPCB AQI".
    expect(screen.queryByText(/Indian AQI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CPCB AQI/i)).not.toBeInTheDocument();
    expect(screen.getByText("US AQI")).toBeInTheDocument();
    expect(screen.getByText("European AQI")).toBeInTheDocument();
  });
});
