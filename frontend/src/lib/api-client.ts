import { config } from "@/lib/config";
import type {
  ApiErrorCode,
  LoginInput,
  LoginResult,
  PendingSignup,
  RegisterAccountInput,
  RegisterAccountResult,
  RegisteredUser,
  VerifyEmailResult,
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

  constructor(
    errorCode: ApiErrorCode,
    message: string,
    status: number,
    fields?: Record<string, string>,
  ) {
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

// Pre-verification shape: `/auth/register` returns only full_name + email
// (see `PendingSignup`); no users row exists until email verification.
interface RawRegisterResponse {
  user: { full_name: string; email: string };
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
      fullName: raw.user.full_name,
      email: raw.user.email,
    } as PendingSignup,
    nextStep: raw.next_step,
    message: raw.message,
  };
}

interface RawVerifyEmailResponse {
  status: "active";
  message: string;
  user: RawUser;
}

export async function verifyEmail(
  input: { email: string; code: string },
  signal?: AbortSignal,
): Promise<VerifyEmailResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, code: input.code }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as RawVerifyEmailResponse;

  return {
    status: raw.status,
    message: raw.message,
    user: toRegisteredUser(raw.user),
  };
}

interface RawUser {
  id: string;
  full_name: string;
  email: string;
  organization_name: string | null;
  role_or_use_case: string | null;
  status: string;
  created_at: string;
}

function toRegisteredUser(raw: RawUser): RegisteredUser {
  return {
    id: raw.id,
    fullName: raw.full_name,
    email: raw.email,
    organizationName: raw.organization_name,
    roleOrUseCase: raw.role_or_use_case,
    status: raw.status as RegisteredUser["status"],
    createdAt: raw.created_at,
  };
}

/**
 * Authenticates email + password against the API and resolves with the
 * signed-in user. Throws `ApiRequestError` (INVALID_CREDENTIALS /
 * EMAIL_NOT_VERIFIED / …) or `ApiUnavailableError`.
 */
export async function login(
  input: LoginInput,
  signal?: AbortSignal,
): Promise<LoginResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as { user: RawUser; message: string };
  return {
    user: toRegisteredUser(raw.user),
    message: raw.message,
  };
}

/**
 * Swaps the single-use ticket from an OAuth callback (Google, GitHub, …)
 * for the signed-in user. Throws `ApiRequestError` (GOOGLE_SESSION_INVALID
 * / …) or `ApiUnavailableError`.
 */
export async function completeOAuthSignup(
  ticket: string,
  signal?: AbortSignal,
): Promise<LoginResult> {
  let response: Response;

  try {
    response = await fetch(`${config.apiUrl}/api/v1/auth/oauth/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
      signal,
    });
  } catch (error) {
    throw new ApiUnavailableError(error);
  }

  if (!response.ok) {
    throw await toApiRequestError(response);
  }

  const raw = (await response.json()) as { user: RawUser; message: string };
  return {
    user: toRegisteredUser(raw.user),
    message: raw.message,
  };
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
