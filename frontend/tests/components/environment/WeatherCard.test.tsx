import { WeatherCard } from "@/components/environment/WeatherCard";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("WeatherCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a loading state before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<WeatherCard latitude={12.9716} longitude={77.5946} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("renders weather metrics once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
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
      }),
    );

    render(<WeatherCard latitude={12.9716} longitude={77.5946} />);

    await waitFor(() => expect(screen.getByText("28.4 °C")).toBeInTheDocument());
    expect(screen.getByText("67 %")).toBeInTheDocument();
    expect(screen.getByText(/SW \/ 225°/)).toBeInTheDocument();
    expect(screen.getByText("Source: Open-Meteo")).toBeInTheDocument();
  });

  it("shows a clean message (not a raw error) when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    render(<WeatherCard latitude={12.9716} longitude={77.5946} />);

    await waitFor(() =>
      expect(screen.getByText("Live weather is temporarily unavailable.")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument();
  });
});
