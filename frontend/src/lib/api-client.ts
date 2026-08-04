import { config } from "@/lib/config";
import type {
  ApiErrorCode,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisteredUser,
} from "@/types/auth";
import type { AggregatedHealthResponse } from "@/types/health";

export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Naksha GeoSphere API is unavailable");
    this.name = "ApiUnavailableError";
    this.cause = cause;
  }
}

/**
 * A request the API reached and rejected (4xx/5xx with a structured error
 * body) — as opposed to `ApiUnavailableError`, which means the API could
 * not be reached at all. Carries the backend's `error_code` so callers can
 * branch on it without parsing message text.
 */
export class ApiRequestError extends Error {
  readonly errorCode: ApiErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(errorCode: ApiErrorCode, message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiRequestError";
    this.errorCode = errorCode;
    this.status = status;
    this.fields = fields;
  }
}

interface RawErrorBody {
  error_code?: string;
  message?: string;
  fields?: Record<string, string>;
  detail?: string;
}

async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  let body: RawErrorBody = {};
  try {
    body = (await response.json()) as RawErrorBody;
  } catch {
    // Non-JSON error body — fall back to a generic message below.
  }
  const errorCode = (body.error_code as ApiErrorCode | undefined) ?? "UNKNOWN_ERROR";
  const message = body.message ?? body.detail ?? "The request could not be completed.";
  return new ApiRequestError(errorCode, message, response.status, body.fields);
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
export async function fetchPlatformHealth(signal?: AbortSignal): Promise<AggregatedHealthResponse> {
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

interface RawRegisteredUser {
  id: string;
  full_name: string;
  email: string;
  organization_name: string;
  role_or_use_case: string;
  status: RegisteredUser["status"];
  created_at: string;
}

interface RawRegisterResponse {
  user: RawRegisteredUser;
  next_step: "verify_email";
  message: string;
}

/**
 * Submits the signup form. Throws `ApiRequestError` for any 4xx/5xx
 * response (duplicate email, validation failure, rate limit, etc.) and
 * `ApiUnavailableError` if the API can't be reached at all — never
 * resolves successfully unless the account was actually created.
 */
export async function registerAccount(
  input: RegisterAccountInput,
  signal?: AbortSignal,
): Promise<RegisterAccountResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: input.fullName,
        email: input.email,
        organization_name: input.organizationName,
        role_or_use_case: input.roleOrUseCase,
        password: input.password,
        confirm_password: input.confirmPassword,
        accepted_terms: input.acceptedTerms,
      }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as RawRegisterResponse;

  return {
    user: {
      id: raw.user.id,
      fullName: raw.user.full_name,
      email: raw.user.email,
      organizationName: raw.user.organization_name,
      roleOrUseCase: raw.user.role_or_use_case,
      status: raw.user.status,
      createdAt: raw.user.created_at,
    },
    nextStep: raw.next_step,
    message: raw.message,
  };
}

export async function verifyEmail(
  token: string,
  signal?: AbortSignal,
): Promise<{ status: string; message: string }> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  return (await response.json()) as { status: string; message: string };
}

export async function resendVerificationEmail(
  email: string,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  return (await response.json()) as { message: string };
}
