"use client";

import { useEffect, useState } from "react";
import { ServiceStatusCard } from "@/components/ServiceStatusCard";
import { ApiUnavailableError, fetchPlatformHealth } from "@/lib/api-client";
import type { AggregatedHealthResponse } from "@/types/health";
import type { IndicatorState } from "@/components/ui/StatusIndicator";

type LoadState = "loading" | "loaded" | "unavailable";

function toIndicatorState(status: "healthy" | "degraded" | "unavailable"): IndicatorState {
  if (status === "healthy") return "operational";
  if (status === "degraded") return "degraded";
  return "unavailable";
}

export function PlatformStatusGrid() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [health, setHealth] = useState<AggregatedHealthResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchPlatformHealth(controller.signal)
      .then((data) => {
        setHealth(data);
        setLoadState("loaded");
      })
      .catch((error) => {
        if (error instanceof ApiUnavailableError) {
          setLoadState("unavailable");
          return;
        }
        if ((error as Error)?.name !== "AbortError") {
          setLoadState("unavailable");
        }
      });

    return () => controller.abort();
  }, []);

  const apiState: IndicatorState =
    loadState === "loading"
      ? "loading"
      : loadState === "unavailable"
        ? "unavailable"
        : "operational";

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ServiceStatusCard
        name="Frontend"
        description="Next.js application serving this page."
        state="operational"
        detail="You are viewing it right now."
      />

      <ServiceStatusCard
        name="API"
        description="FastAPI backend at /api/v1."
        state={apiState}
        detail={
          loadState === "unavailable"
            ? "Unreachable — start the API service to restore this check."
            : loadState === "loading"
              ? undefined
              : `Version ${health?.version ?? "unknown"} · ${health?.environment ?? ""}`
        }
      />

      <ServiceStatusCard
        name="PostGIS"
        description="PostgreSQL + PostGIS primary database."
        state={
          loadState === "loading"
            ? "loading"
            : loadState === "unavailable"
              ? "unknown"
              : toIndicatorState(health!.services.database.status)
        }
        detail={loadState === "loaded" ? health?.services.database.detail : undefined}
      />

      <ServiceStatusCard
        name="Redis"
        description="Celery broker, result backend, and cache."
        state={
          loadState === "loading"
            ? "loading"
            : loadState === "unavailable"
              ? "unknown"
              : toIndicatorState(health!.services.redis.status)
        }
        detail={loadState === "loaded" ? health?.services.redis.detail : undefined}
      />

      <ServiceStatusCard
        name="Object Storage"
        description="MinIO (S3-compatible) private buckets."
        state={
          loadState === "loading"
            ? "loading"
            : loadState === "unavailable"
              ? "unknown"
              : toIndicatorState(health!.services.objectStorage.status)
        }
        detail={loadState === "loaded" ? health?.services.objectStorage.detail : undefined}
      />

      <ServiceStatusCard
        name="Processing Worker"
        description="Celery worker for raster, vector, and LiDAR jobs."
        state="unknown"
        detail="Not exposed via the health endpoint yet — verify with `pnpm worker:ping`."
      />
    </div>
  );
}
