import { formatIstTime, formatMetric } from "@/lib/environmentFormat";
import type { DataStatus, WeatherObservation } from "@/types/environment";

export interface WeatherDetailsProps {
  weather: WeatherObservation;
  dataStatus?: DataStatus | null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="text-sm font-medium text-obsidian-graphite">{value}</dd>
    </div>
  );
}

export function WeatherDetails({ weather, dataStatus }: WeatherDetailsProps) {
  const direction =
    weather.windDirectionCompass && weather.windDirectionDegrees !== null
      ? `${weather.windDirectionCompass} / ${weather.windDirectionDegrees}°`
      : "—";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {dataStatus === "STALE" && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            Showing last known reading
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Temperature" value={formatMetric(weather.temperatureC, "°C")} />
        <Metric label="Humidity" value={formatMetric(weather.relativeHumidityPercent, "%")} />
        <Metric label="Rain" value={formatMetric(weather.rainMm, "mm")} />
        <Metric label="Precipitation" value={formatMetric(weather.precipitationMm, "mm")} />
        <Metric label="Wind" value={formatMetric(weather.windSpeedKmh, "km/h")} />
        <Metric label="Direction" value={direction} />
        <Metric label="Pressure" value={formatMetric(weather.surfacePressureHpa, "hPa")} />
        <Metric label="Observed" value={formatIstTime(weather.observationTime)} />
      </dl>
      <p className="mt-4 text-xs text-[var(--color-text-secondary)]">Source: {weather.source}</p>
    </div>
  );
}
