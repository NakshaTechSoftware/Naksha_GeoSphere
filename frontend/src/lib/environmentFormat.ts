/** Shared formatting helpers for the environment (weather/AQI) feature. */

export function formatIstTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return `${new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso))} IST`;
  } catch {
    return "—";
  }
}

export function formatMetric(value: number | null, unit: string): string {
  return value === null || value === undefined ? "—" : `${value} ${unit}`;
}
