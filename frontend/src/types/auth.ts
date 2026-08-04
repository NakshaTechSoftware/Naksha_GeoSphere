export type UserStatus = "pending_verification" | "active" | "suspended" | "disabled";

export interface RegisteredUser {
  id: string;
  fullName: string;
  email: string;
  organizationName: string;
  roleOrUseCase: string;
  status: UserStatus;
  createdAt: string;
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
  user: RegisteredUser;
  nextStep: "verify_email";
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
  | "INVALID_OR_EXPIRED_TOKEN"
  | "UNKNOWN_ERROR";
