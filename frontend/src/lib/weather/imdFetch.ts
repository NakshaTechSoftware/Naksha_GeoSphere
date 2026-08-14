// Shared upstream fetcher for IMD (India Meteorological Department) assets.
//
// Used by the satellite imagery proxy routes (imd-satellite). Returns the
// raw response as a Buffer together with status + (lowercased) headers so
// callers can proxy the bytes and forward caching/attribution metadata.
//
// IMD's gateway silently tarpits (hangs indefinitely) requests carrying a
// library-style User-Agent, so an honest app identifier is set.

export interface ImdAssetResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export async function fetchImdAsset(
  url: string,
  opts: { timeoutMs?: number } = {}
): Promise<ImdAssetResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NakshaGeoSphere/1.0 (+environment-module)" },
      cache: "no-store",
    });
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { status: response.status, headers, body };
  } finally {
    clearTimeout(timeout);
  }
}
