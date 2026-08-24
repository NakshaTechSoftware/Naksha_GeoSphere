import { formatIstTime, formatMetric } from "@/lib/environmentFormat";
import type { DataStatus, ModeledAirQuality } from "@/types/environment";

export interface ModeledAqiDetailsProps {
  airQuality: ModeledAirQuality;
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

export function ModeledAqiDetails({ airQuality, dataStatus }: ModeledAqiDetailsProps) {
  return (
    <div>
      {dataStatus === "STALE" && (
        <span className="mb-3 inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Showing last known reading
        </span>
      )}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="PM2.5" value={formatMetric(airQuality.pm2_5, "µg/m³")} />
        <Metric label="PM10" value={formatMetric(airQuality.pm10, "µg/m³")} />
        <Metric label="CO" value={formatMetric(airQuality.co, "µg/m³")} />
        <Metric label="NO2" value={formatMetric(airQuality.no2, "µg/m³")} />
        <Metric label="SO2" value={formatMetric(airQuality.so2, "µg/m³")} />
        <Metric label="O3" value={formatMetric(airQuality.o3, "µg/m³")} />
        <Metric label="US AQI" value={formatMetric(airQuality.usAqi, "")} />
        <Metric label="European AQI" value={formatMetric(airQuality.europeanAqi, "")} />
      </dl>
      <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
        Observed: {formatIstTime(airQuality.observationTime)} · Source: {airQuality.source} ·
        Type: Modeled / gridded (not an official CPCB station reading)
      </p>
    </div>
  );
}
