import { config } from "@/lib/config";
import type { AggregatedHealthResponse } from "@/types/health";

export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Naksha GeoSphere API is unavailable");
    this.name = "ApiUnavailableError";
    this.cause = cause;
  }
}

interface RawServiceHealth {
  status: "healthy" | "degraded" | "unavailable";
  detail: string;
  latency_ms?: number;
}

interface RawAggregatedHealth {
  status: "healthy" | "degraded" | "unavailable";
  timestamp: string;
  version: string;
  environment: string;
  services: {
    database: RawServiceHealth;
    redis: RawServiceHealth;
    object_storage: RawServiceHealth;
  };
}

/**
 * Fetches the aggregated platform health snapshot from the API.
 * Never throws for a reachable-but-unhealthy API (the backend encodes that
 * in the response body); only throws when the API cannot be reached at all,
 * so callers can render a distinct "API unavailable" state.
 */
export async function fetchPlatformHealth(
  signal?: AbortSignal,
): Promise<AggregatedHealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/health`, {
      method: "GET",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok && response.status >= 500) {
    // Server reached but failing hard — still surface as unavailable.
    throw new ApiUnavailableError(new Error(`HTTP ${response.status}`));
  }

  const raw = (await response.json()) as RawAggregatedHealth;

  return {
    status: raw.status,
    timestamp: raw.timestamp,
    version: raw.version,
    environment: raw.environment,
    services: {
      database: {
        status: raw.services.database.status,
        detail: raw.services.database.detail,
        latencyMs: raw.services.database.latency_ms,
      },
      redis: {
        status: raw.services.redis.status,
        detail: raw.services.redis.detail,
        latencyMs: raw.services.redis.latency_ms,
      },
      objectStorage: {
        status: raw.services.object_storage.status,
        detail: raw.services.object_storage.detail,
        latencyMs: raw.services.object_storage.latency_ms,
      },
    },
  };
}
