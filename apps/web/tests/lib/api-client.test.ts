import { ApiUnavailableError, fetchPlatformHealth } from "@/lib/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("fetchPlatformHealth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws ApiUnavailableError when the network request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(fetchPlatformHealth()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("maps snake_case service keys to camelCase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "healthy",
          timestamp: "2026-08-03T00:00:00Z",
          version: "0.1.0",
          environment: "development",
          services: {
            database: { status: "healthy", detail: "PostGIS reachable" },
            redis: { status: "healthy", detail: "PONG" },
            object_storage: { status: "healthy", detail: "buckets present" },
          },
        }),
      }),
    );

    const result = await fetchPlatformHealth();
    expect(result.services.objectStorage.detail).toBe("buckets present");
  });
});
