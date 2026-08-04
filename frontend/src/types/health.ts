export type ServiceHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ServiceHealthDetail {
  status: ServiceHealthStatus;
  detail: string;
  latencyMs?: number;
}

export interface AggregatedHealthResponse {
  status: ServiceHealthStatus;
  timestamp: string;
  version: string;
  environment: string;
  services: {
    database: ServiceHealthDetail;
    redis: ServiceHealthDetail;
    objectStorage: ServiceHealthDetail;
  };
}
