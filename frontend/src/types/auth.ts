export type UserStatus = "pending_verification" | "active" | "suspended" | "disabled";

/** A verified user row (post-email-verification shape). */
export interface RegisteredUser {
  id: string;
  fullName: string;
  email: string;
  organizationName: string | null;
  roleOrUseCase: string | null;
  status: UserStatus;
  createdAt: string;
}

/**
 * The `user` field of a successful `/auth/register` response. No `users`
 * row exists yet at that point, so there is no id/status/created_at — only
 * what the signup UI needs to render "check your email".
 */
export interface PendingSignup {
  fullName: string;
  email: string;
}

export interface RegisterAccountInput {
  fullName: string;
  email: string;
  organizationName: string;
  roleOrUseCase: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

export interface RegisterAccountResult {
  user: PendingSignup;
  nextStep: "verify_email";
  message: string;
}

/** The response of a successful `/auth/verify-email` call — verification
 * activates the account and returns the created user so the frontend can
 * establish a session without a separate login round-trip. */
export interface VerifyEmailResult {
  status: "active";
  message: string;
  user: RegisteredUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** The response of a successful `/auth/login` call. */
export interface LoginResult {
  user: RegisteredUser;
  message: string;
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "PASSWORDS_DO_NOT_MATCH"
  | "TERMS_NOT_ACCEPTED"
  | "INVALID_ROLE_OR_USE_CASE"
  | "EMAIL_ALREADY_REGISTERED"
  | "REGISTRATION_RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "REGISTRATION_FAILED"
  | "INVALID_OR_EXPIRED_CODE"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "LOGIN_FAILED"
  | "GOOGLE_AUTH_ERROR"
  | "GOOGLE_SESSION_INVALID"
  | "UNKNOWN_ERROR";
