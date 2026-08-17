import {
  ApiRequestError,
  ApiUnavailableError,
  fetchPlatformHealth,
  login,
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

  it("sends snake_case fields and maps the PendingSignup response back to camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        user: { full_name: "Ada Lovelace", email: "ada@example.com" },
        next_step: "verify_email",
        message: "Account created. Please verify your email address.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await registerAccount(VALID_INPUT);

    // No users row exists at registration time — only fullName/email come back.
    expect(result.user.fullName).toBe("Ada Lovelace");
    expect(result.user.email).toBe("ada@example.com");
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

  it("sends the email + code and resolves with the verified user on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "active",
        message: "Email verified successfully.",
        user: {
          id: "abc-123",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          organization_name: "Example Org",
          role_or_use_case: "developer",
          status: "active",
          created_at: "2026-08-13T00:00:00Z",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyEmail({ email: "ada@example.com", code: "123456" });
    expect(result.status).toBe("active");
    expect(result.user).toEqual({
      id: "abc-123",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      organizationName: "Example Org",
      roleOrUseCase: "developer",
      status: "active",
      createdAt: "2026-08-13T00:00:00Z",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual({ email: "ada@example.com", code: "123456" });
  });

  it("throws ApiRequestError for an invalid or expired code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error_code: "INVALID_OR_EXPIRED_CODE",
          message: "This verification code is invalid or has expired.",
        }),
      }),
    );

    const error = await verifyEmail({ email: "ada@example.com", code: "000000" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).errorCode).toBe("INVALID_OR_EXPIRED_CODE");
  });
});

describe("login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("authenticates and resolves with the signed-in user", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: "abc-123",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          organization_name: "Example Org",
          role_or_use_case: "developer",
          status: "active",
          created_at: "2026-08-13T00:00:00Z",
        },
        message: "Signed in successfully.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await login({ email: "ada@example.com", password: "hunter2" });
    expect(result.user.fullName).toBe("Ada Lovelace");
    expect(result.message).toBe("Signed in successfully.");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual({ email: "ada@example.com", password: "hunter2" });
  });

  it("throws ApiRequestError for invalid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error_code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        }),
      }),
    );

    const error = await login({ email: "ada@example.com", password: "wrong" }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).errorCode).toBe("INVALID_CREDENTIALS");
    expect((error as ApiRequestError).status).toBe(401);
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
