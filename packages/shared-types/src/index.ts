/**
 * Shared TypeScript contract types for Naksha GeoSphere.
 *
 * This package is intentionally near-empty in the foundation phase — it
 * exists so future marketplace types (dataset, AOI, order, license, ...)
 * have one canonical home shared between `apps/web` and any future
 * TypeScript service clients, instead of being duplicated per-app.
 */

export type ServiceHealthStatus = "healthy" | "degraded" | "unavailable";
