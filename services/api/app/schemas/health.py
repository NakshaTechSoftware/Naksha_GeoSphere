"""Response models for the health endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

HealthStatus = Literal["healthy", "degraded", "unavailable"]


class LivenessResponse(BaseModel):
    status: Literal["alive"] = "alive"


class ServiceHealth(BaseModel):
    status: HealthStatus
    detail: str
    latency_ms: float | None = None


class ReadinessServices(BaseModel):
    database: ServiceHealth
    redis: ServiceHealth
    object_storage: ServiceHealth


class ReadinessResponse(BaseModel):
    status: HealthStatus
    services: ReadinessServices


class AggregatedHealthResponse(BaseModel):
    status: HealthStatus
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version: str
    environment: str
    services: ReadinessServices
