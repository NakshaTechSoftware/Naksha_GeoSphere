// INR formatting - the demo never shows USD.

/** Formats an amount as INR using the en-IN locale, e.g. ₹1,249. */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** The deterministic demo price shown for the AOI package. */
export function demoPrice(datasetIds: string[]): number {
  return datasetIds.reduce((sum, id) => {
    const base: Record<string, number> = {
      imagery: 999,
      elevation: 699,
      kml: 250,
      contours: 549,
      "3d": 1499,
    };
    return sum + (base[id] ?? 0);
  }, 0);
}
