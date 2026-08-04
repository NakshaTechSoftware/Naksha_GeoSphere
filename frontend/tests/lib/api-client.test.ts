import {
  ApiRequestError,
  ApiUnavailableError,
  fetchPlatformHealth,
  registerAccount,
  resendVerificationEmail,
  verifyEmail,
} from "@/lib/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";

const VALID_INPUT = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  organizationName: "Example Org",
  roleOrUseCase: "developer",
  password: "a-strong-password-123",
  confirmPassword: "a-strong-password-123",
  acceptedTerms: true,
};

describe("fetchPlatformHealth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws ApiUnavailableError when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

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

describe("registerAccount", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends snake_case fields and maps a snake_case response back to camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          organization_name: "Example Org",
          role_or_use_case: "developer",
          status: "pending_verification",
          created_at: "2026-08-04T00:00:00Z",
        },
        next_step: "verify_email",
        message: "Account created. Please verify your email address.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await registerAccount(VALID_INPUT);

    expect(result.user.organizationName).toBe("Example Org");
    expect(result.user.roleOrUseCase).toBe("developer");
    expect(result.nextStep).toBe("verify_email");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toMatchObject({
      full_name: "Ada Lovelace",
      organization_name: "Example Org",
      role_or_use_case: "developer",
      confirm_password: "a-strong-password-123",
      accepted_terms: true,
    });
    // password must round-trip byte-for-byte, never modified.
    expect(sentBody.password).toBe("a-strong-password-123");
  });

  it("throws ApiRequestError with the backend's error_code on a 409", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error_code: "EMAIL_ALREADY_REGISTERED",
          message: "An account already exists for this email.",
        }),
      }),
    );

    const error = await registerAccount(VALID_INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).errorCode).toBe("EMAIL_ALREADY_REGISTERED");
    expect((error as ApiRequestError).status).toBe(409);
  });

  it("throws ApiRequestError carrying field errors on a 422 VALIDATION_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error_code: "VALIDATION_ERROR",
          message: "One or more fields are invalid.",
          fields: { email: "value is not a valid email address" },
        }),
      }),
    );

    const error = await registerAccount(VALID_INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).fields).toEqual({
      email: "value is not a valid email address",
    });
  });

  it("throws ApiUnavailableError when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(registerAccount(VALID_INPUT)).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});

describe("verifyEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves with the verified status on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "active", message: "Email verified successfully." }),
      }),
    );

    const result = await verifyEmail("raw-token-value");
    expect(result.status).toBe("active");
  });

  it("throws ApiRequestError for an invalid or expired token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error_code: "INVALID_OR_EXPIRED_TOKEN",
          message: "This verification link is invalid or has expired.",
        }),
      }),
    );

    const error = await verifyEmail("bad-token").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).errorCode).toBe("INVALID_OR_EXPIRED_TOKEN");
  });
});

describe("resendVerificationEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves with a generic message regardless of whether the account exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: "If an account exists..." }),
      }),
    );

    const result = await resendVerificationEmail("someone@example.com");
    expect(result.message).toContain("If an account exists");
  });
});
