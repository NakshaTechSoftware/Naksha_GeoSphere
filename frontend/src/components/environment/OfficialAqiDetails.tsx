import { formatIstTime, formatMetric } from "@/lib/environmentFormat";
import type { AqiCategory, CpcbStation, DataStatus } from "@/types/environment";

export interface OfficialAqiDetailsProps {
  station: CpcbStation;
  distanceKm?: number | null;
  dataStatus?: DataStatus | null;
}

const CATEGORY_COLOR: Record<AqiCategory, string> = {
  Good: "bg-emerald-50 text-emerald-700",
  Satisfactory: "bg-lime-50 text-lime-700",
  Moderate: "bg-amber-50 text-amber-700",
  Poor: "bg-orange-50 text-orange-700",
  "Very Poor": "bg-red-50 text-red-700",
  Severe: "bg-red-100 text-red-900",
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="text-sm font-medium text-obsidian-graphite">{value}</dd>
    </div>
  );
}

export function OfficialAqiDetails({ station, distanceKm, dataStatus }: OfficialAqiDetailsProps) {
  const pollutant = (key: string) => formatMetric(station.pollutants[key]?.avg ?? null, "µg/m³");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {station.aqiCategory && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORY_COLOR[station.aqiCategory]}`}
          >
            {station.aqiCategory}
          </span>
        )}
        {dataStatus === "STALE" && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            Showing last known reading
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-obsidian-graphite">
        Nearest CPCB station:{" "}
        <span className="font-medium">
          {station.city} — {station.station}
        </span>
        {distanceKm != null && (
          <span className="text-[var(--color-text-secondary)]"> ({distanceKm} km away)</span>
        )}
      </p>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          label="AQI"
          value={station.aqiValue !== null ? String(station.aqiValue) : "Not available"}
        />
        <Metric label="PM2.5" value={pollutant("PM2.5")} />
        <Metric label="PM10" value={pollutant("PM10")} />
        <Metric label="NO2" value={pollutant("NO2")} />
        <Metric label="SO2" value={pollutant("SO2")} />
        <Metric label="CO" value={pollutant("CO")} />
        <Metric label="O3" value={pollutant("O3")} />
        <Metric label="NH3" value={pollutant("NH3")} />
      </dl>

      <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
        Last observation: {formatIstTime(station.lastUpdate)} · Source: {station.source} · Type:
        Measured (monitoring station) · AQI basis:{" "}
        {station.aqiSource === "SOURCE_CPCB"
          ? "published by CPCB"
          : station.aqiSource === "CALCULATED_CPCB"
            ? "calculated from CPCB pollutant readings using the official breakpoint table"
            : "not available"}
      </p>
    </div>
  );
}
