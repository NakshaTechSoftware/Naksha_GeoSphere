"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  Mail,
  Building,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  ApiRequestError,
  ApiUnavailableError,
  completeOAuthSignup,
  registerAccount,
  resendVerificationEmail,
  verifyEmail,
} from "@/lib/api-client";
import { buildGitHubAuthUrl, isGitHubSignInConfigured } from "@/lib/github-oauth";
import { buildGoogleAuthUrl, isGoogleSignInConfigured } from "@/lib/google-oauth";
import { signInUser } from "@/lib/session";
import type { RegisteredUser } from "@/types/auth";

type Step = "account" | "verify";
type VerifyStatus = "entering" | "verifying" | "success" | "error";

const ROLE_OPTIONS = [
  { value: "gis-analyst", label: "GIS Analyst" },
  { value: "researcher", label: "Researcher" },
  { value: "developer", label: "Developer" },
  { value: "data-scientist", label: "Data Scientist" },
  { value: "engineer", label: "Engineer" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_CODE_PATTERN = /^\d{6}$/;

const PASSWORD_REQUIREMENTS: { key: string; label: string; test: (v: string) => boolean }[] = [
  {
    key: "length",
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (v) => v.length >= MIN_PASSWORD_LENGTH,
  },
  { key: "uppercase", label: "One uppercase letter (A-Z)", test: (v) => /[A-Z]/.test(v) },
  { key: "lowercase", label: "One lowercase letter (a-z)", test: (v) => /[a-z]/.test(v) },
  { key: "number", label: "One number (0-9)", test: (v) => /\d/.test(v) },
  { key: "special", label: "One special character (!@#$…)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function isStrongPassword(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(password));
}

// Maps backend request-field names (snake_case) to this form's local
// state keys, for displaying server-side VALIDATION_ERROR responses
// under the right input.
const BACKEND_TO_FORM_FIELD: Record<string, string> = {
  full_name: "fullName",
  organization_name: "organization",
  role_or_use_case: "role",
  confirm_password: "confirmPassword",
};

interface FormData {
  fullName: string;
  email: string;
  organization: string;
  role: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}

function validate(formData: FormData): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!formData.fullName.trim()) {
    errors.fullName = "Full name is required.";
  }
  if (!EMAIL_PATTERN.test(formData.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (!isStrongPassword(formData.password)) {
    errors.password = "Password does not meet the requirements below.";
  }
  if (formData.confirmPassword !== formData.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  if (!formData.agreeToTerms) {
    errors.agreeToTerms = "You must accept the Terms of Service and Privacy Policy.";
  }

  return errors;
}

export function SignupForm() {
  const [currentStep, setCurrentStep] = useState<Step>("account");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    fullName: "",
    email: "",
    organization: "",
    role: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // Step 2 — email OTP entry. `register()` already unconditionally queues
  // the code, so there's no separate "send" trigger here.
  const [otpCode, setOtpCode] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("entering");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifiedUser, setVerifiedUser] = useState<RegisteredUser | null>(null);
  const verifyingRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === "fullName") {
      setFormData((prev) => ({ ...prev, fullName: value.replace(/[^A-Za-z\s'.-]/g, "") }));
      return;
    }

    if (name === "email") {
      setFormData((prev) => ({ ...prev, email: value.replace(/\s/g, "") }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setFieldErrors((prev) => {
      if (!value || EMAIL_PATTERN.test(value)) {
        const rest = { ...prev };
        delete rest.email;
        return rest;
      }
      return { ...prev, email: "Enter a valid email address." };
    });
  };

  const handleConfirmPasswordBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFieldErrors((prev) => {
      if (!value || value === formData.password) {
        const rest = { ...prev };
        delete rest.confirmPassword;
        return rest;
      }
      return { ...prev, confirmPassword: "Passwords do not match." };
    });
  };

  /** Validates the account form and registers directly — no phone-OTP gate. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setFormError(null);
    setDuplicateEmail(false);

    const errors = validate(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    // Belt-and-braces guard against double submission (fast double-click
    // before React re-renders the disabled button).
    if (submittingRef.current || submitting) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const result = await registerAccount({
        fullName: formData.fullName,
        email: formData.email,
        organizationName: formData.organization,
        roleOrUseCase: formData.role,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        acceptedTerms: formData.agreeToTerms,
      });

      setRegisteredEmail(result.user.email);
      setCurrentStep("verify");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.errorCode === "EMAIL_ALREADY_REGISTERED") {
          setDuplicateEmail(true);
        } else if (error.errorCode === "VALIDATION_ERROR" && error.fields) {
          const mapped: Record<string, string> = {};
          for (const [key, message] of Object.entries(error.fields)) {
            mapped[BACKEND_TO_FORM_FIELD[key] ?? key] = message;
          }
          setFieldErrors(mapped);
          setFormError("Some fields need your attention. Edit your details and try again.");
        } else if (error.errorCode === "REGISTRATION_RATE_LIMITED") {
          setFormError("Too many attempts. Please wait a few minutes and try again.");
        } else {
          setFormError(error.message);
        }
      } else if (error instanceof ApiUnavailableError) {
        setFormError("We couldn't reach the server. Check your connection and try again.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  /** Starts the Google authorization-code flow (PKCE); the browser leaves
   *  the app and returns to `/signup?google_session=<ticket>` afterwards. */
  const handleGoogleSignup = async () => {
    if (!isGoogleSignInConfigured()) {
      setFormError("Google sign-in isn't configured yet. Use email signup for now.");
      return;
    }
    try {
      const authUrl = await buildGoogleAuthUrl();
      window.location.assign(authUrl);
    } catch {
      setFormError("Couldn't start Google sign-in. Please try again.");
    }
  };

  /** Starts the GitHub authorization-code flow; the browser leaves the
   *  app and returns to `/signup?oauth_session=<ticket>` afterwards. */
  const handleGitHubSignup = async () => {
    if (!isGitHubSignInConfigured()) {
      setFormError("GitHub sign-in isn't configured yet. Use email signup for now.");
      return;
    }
    try {
      window.location.assign(buildGitHubAuthUrl("/signup"));
    } catch {
      setFormError("Couldn't start GitHub sign-in. Please try again.");
    }
  };

  // Completes an OAuth round-trip (Google or GitHub): the backend exchanged
  // the code, activated/created the account, and redirected here with a
  // one-time ticket — swap it for the user and sign in.
  useEffect(() => {
    const ticket = searchParams.get("oauth_session");
    if (!ticket) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await completeOAuthSignup(ticket);
        if (cancelled) {
          return;
        }
        signInUser({ email: result.user.email, name: result.user.fullName });
        router.replace("/explore");
      } catch {
        if (!cancelled) {
          setFormError("Sign-in couldn't be completed. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
  };

  /** Checks the emailed code against OUR backend, which verifies it and
   *  activates the account in one step — no separate email-link click. */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!OTP_CODE_PATTERN.test(otpCode)) {
      setOtpError("Enter the 6-digit code we sent you.");
      return;
    }
    if (verifyingRef.current || verifyStatus === "verifying") {
      return;
    }

    verifyingRef.current = true;
    setVerifyStatus("verifying");
    setOtpError(null);

    try {
      const result = await verifyEmail({ email: registeredEmail, code: otpCode });
      setVerifiedUser(result.user);
      setVerifyStatus("success");
    } catch (error) {
      setVerifyStatus("error");
      if (error instanceof ApiRequestError) {
        setOtpError(error.message);
      } else if (error instanceof ApiUnavailableError) {
        setOtpError("We couldn't reach the server. Check your connection and try again.");
      } else {
        setOtpError("Something went wrong. Please try again.");
      }
    } finally {
      verifyingRef.current = false;
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus the OTP input once Step 2 renders (a code is already in the
  // user's inbox by then — register() queues it unconditionally).
  useEffect(() => {
    if (currentStep === "verify" && verifyStatus === "entering") {
      otpInputRef.current?.focus();
    }
  }, [currentStep, verifyStatus]);

  /** Verification activates the account — "Sign In" therefore needs no
   *  credentials: establish the session from the verified user and go
   *  straight to the explore page. */
  const handleAutoSignIn = () => {
    const user = verifiedUser ?? {
      fullName: formData.fullName,
      email: registeredEmail,
    };
    signInUser({ email: user.email, name: user.fullName });
    router.push("/explore");
  };

  const handleResend = async () => {
    if (!registeredEmail || resendCooldown > 0 || resendStatus === "sending") {
      return;
    }
    setResendStatus("sending");
    try {
      await resendVerificationEmail(registeredEmail);
    } catch {
      // Resend uses a generic response even on failure to avoid account
      // enumeration — no distinct error state to show here.
    }
    setResendStatus("sent");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    // The old code is invalidated by a resend — clear it so a stale/wrong
    // entry doesn't linger.
    setOtpCode("");
    setOtpError(null);
    setVerifyStatus("entering");
  };

  const requiredFieldsFilled = Boolean(
    formData.fullName.trim() &&
      formData.email.trim() &&
      isStrongPassword(formData.password) &&
      formData.confirmPassword === formData.password,
  );
  const termsDisabled = !requiredFieldsFilled;
  const confirmPasswordDisabled = !isStrongPassword(formData.password);

  // If a required field is cleared after the box was checked, force it back off so
  // the user has to actively re-confirm once the fields are filled again.
  useEffect(() => {
    if (!requiredFieldsFilled && formData.agreeToTerms) {
      setFormData((prev) => ({ ...prev, agreeToTerms: false }));
    }
  }, [requiredFieldsFilled, formData.agreeToTerms]);

  // If the password stops meeting the strength requirements after confirm-password
  // was already typed, clear confirm-password so a weak password can't be "locked in"
  // by a value that was only ever checked against the earlier, stronger password.
  useEffect(() => {
    if (!isStrongPassword(formData.password) && formData.confirmPassword) {
      setFormData((prev) => ({ ...prev, confirmPassword: "" }));
    }
  }, [formData.password, formData.confirmPassword]);

  // Keeps the confirm-password mismatch error in sync as either field changes,
  // not just on blur (e.g. editing password after confirm was already typed).
  useEffect(() => {
    if (!formData.confirmPassword) return;
    setFieldErrors((prev) => {
      const matches = formData.confirmPassword === formData.password;
      if (matches && prev.confirmPassword) {
        const rest = { ...prev };
        delete rest.confirmPassword;
        return rest;
      }
      if (!matches && !prev.confirmPassword) {
        return { ...prev, confirmPassword: "Passwords do not match." };
      }
      return prev;
    });
  }, [formData.password, formData.confirmPassword]);

  const errorBanner = (formError || duplicateEmail) && (
    <div
      role="alert"
      className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {duplicateEmail ? (
          <>
            An account already exists for this email.{" "}
            <a href="/login" className="font-medium underline">
              Sign in
            </a>{" "}
            or{" "}
            <a href="/reset-password" className="font-medium underline">
              reset your password
            </a>
            .
          </>
        ) : (
          formError
        )}
      </p>
    </div>
  );

  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card lg:p-10">
      {/* Step Indicator */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-500 ${
              currentStep === "account"
                ? "bg-atlas-cobalt text-white"
                : "bg-[var(--color-cobalt-soft)] text-atlas-cobalt"
            }`}
          >
            1
          </div>
          <span
            className={`text-sm font-medium ${
              currentStep === "account" ? "text-obsidian-graphite" : "text-obsidian-graphite/50"
            }`}
          >
            Account Details
          </span>
        </div>

        <div className="relative h-px flex-1 overflow-hidden bg-[var(--color-border-medium)]">
          <div
            className={`absolute inset-y-0 left-0 bg-atlas-cobalt transition-all duration-700 ease-out ${
              currentStep === "account" ? "w-0" : "w-full"
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors delay-500 duration-500 ${
              currentStep === "account"
                ? "text-obsidian-graphite/40 bg-[var(--color-border-subtle)]"
                : "bg-atlas-cobalt text-white"
            }`}
          >
            2
          </div>
          <span
            className={`text-sm font-medium ${
              currentStep === "account" ? "text-obsidian-graphite/50" : "text-obsidian-graphite"
            }`}
          >
            Verify Email
          </span>
        </div>
      </div>

      {currentStep === "account" ? (
        <>
          {/* Form Title */}
          <h2 className="mb-2 text-2xl font-bold text-obsidian-graphite">Create your account</h2>
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">Step 1 of 2</p>

          {errorBanner}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Full Name */}
            <div>
              <label
                htmlFor="fullName"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Full Name
              </label>
              <div className="relative">
                <User className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2"
                  placeholder="Enter your full name"
                />
              </div>
              {fieldErrors.fullName && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleEmailBlur}
                  aria-invalid={Boolean(fieldErrors.email)}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2"
                  placeholder="you@company.com"
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.email}</p>
              )}
            </div>

            {/* Organization / Company */}
            <div>
              <label
                htmlFor="organization"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Organization / Company
              </label>
              <div className="relative">
                <Building className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <input
                  type="text"
                  id="organization"
                  name="organization"
                  value={formData.organization}
                  onChange={handleInputChange}
                  aria-invalid={Boolean(fieldErrors.organization)}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2"
                  placeholder="Your organization"
                />
              </div>
              {fieldErrors.organization && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.organization}</p>
              )}
            </div>

            {/* Role or Use Case */}
            <div>
              <label
                htmlFor="role"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Role or Use Case
              </label>
              <div className="relative">
                <Briefcase className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  aria-invalid={Boolean(fieldErrors.role)}
                  className="focus:ring-atlas-cobalt/20 w-full appearance-none rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2"
                >
                  <option value="">Select your role</option>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg
                    className="text-obsidian-graphite/40 h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>
              {fieldErrors.role && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.role}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  aria-invalid={Boolean(fieldErrors.password)}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2"
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-obsidian-graphite/40 absolute right-3 top-1/2 -translate-y-1/2 hover:text-obsidian-graphite"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.password}</p>
              )}
              {formData.password && (
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const met = req.test(formData.password);
                    return (
                      <li
                        key={req.key}
                        className={`flex items-center gap-1.5 text-xs ${
                          met ? "text-green-600" : "text-obsidian-graphite/50"
                        }`}
                      >
                        {met ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-obsidian-graphite"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="text-obsidian-graphite/40 absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  onBlur={handleConfirmPasswordBlur}
                  disabled={confirmPasswordDisabled}
                  aria-invalid={Boolean(fieldErrors.confirmPassword)}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder={
                    confirmPasswordDisabled
                      ? "Meet all requirements above first"
                      : "Confirm your password"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={confirmPasswordDisabled}
                  className="text-obsidian-graphite/40 absolute right-3 top-1/2 -translate-y-1/2 hover:text-obsidian-graphite disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-600">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Terms Agreement */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="agreeToTerms"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange}
                disabled={termsDisabled}
                className="focus:ring-atlas-cobalt/20 mt-0.5 h-4 w-4 rounded border-[var(--color-border-medium)] text-atlas-cobalt focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <label
                htmlFor="agreeToTerms"
                className={`text-sm text-obsidian-graphite ${termsDisabled ? "opacity-50" : ""}`}
              >
                I agree to the{" "}
                <a href="/terms" className="font-medium text-atlas-cobalt hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="font-medium text-atlas-cobalt hover:underline">
                  Privacy Policy
                </a>
                .
              </label>
            </div>
            {fieldErrors.agreeToTerms && (
              <p className="-mt-3 text-xs text-red-600">{fieldErrors.agreeToTerms}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!formData.agreeToTerms || submitting}
              className={`w-full rounded-lg py-3 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                formData.agreeToTerms
                  ? "bg-atlas-cobalt text-white shadow-[0_4px_0_0_var(--color-cobalt-hover)] hover:brightness-105 focus:ring-atlas-cobalt active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-cobalt-hover)] disabled:cursor-not-allowed disabled:opacity-80 disabled:active:translate-y-0"
                  : "cursor-not-allowed bg-gray-200 text-gray-400 shadow-[0_4px_0_0_rgb(209,213,219)] focus:ring-gray-300"
              }`}
            >
              {submitting ? "Creating account…" : "Create Account"}
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--color-border-medium)]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="text-obsidian-graphite/60 bg-white px-4">or continue with</span>
              </div>
            </div>

            {/* Social Signup */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleGoogleSignup}
                className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 text-sm font-medium text-obsidian-graphite transition-colors hover:bg-[var(--color-cobalt-soft)]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>
              <button
                type="button"
                onClick={handleGitHubSignup}
                className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 text-sm font-medium text-obsidian-graphite transition-colors hover:bg-[var(--color-cobalt-soft)]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                  />
                </svg>
                Continue with GitHub
              </button>
            </div>
          </form>
        </>
      ) : (
        /* Step 2 — Verify Email. register() already queued a 6-digit code
           to the user's inbox; this step collects it and activates the
           account in one call, no separate link click needed. */
        <div>
          <h2 className="mb-2 text-2xl font-bold text-obsidian-graphite">Verify your email</h2>

          {errorBanner}

          {verifyStatus === "success" ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
              <h3 className="mb-2 text-xl font-bold text-obsidian-graphite">
                Email verified successfully.
              </h3>
              <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                Your account is now active. We&rsquo;ve signed you in — start exploring.
              </p>
              <button
                type="button"
                onClick={handleAutoSignIn}
                className="inline-flex w-full items-center justify-center rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)]"
              >
                Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} noValidate className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)]">
                <Mail className="h-7 w-7 text-atlas-cobalt" />
              </div>
              <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-obsidian-graphite">{registeredEmail}</span>.
                Enter it below to activate your account.
              </p>

              {otpError && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{otpError}</p>
                </div>
              )}

              <label htmlFor="otpCode" className="sr-only">
                Enter the 6-digit code
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                id="otpCode"
                name="otpCode"
                value={otpCode}
                onChange={handleOtpChange}
                disabled={verifyStatus === "verifying"}
                className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white px-4 py-2.5 text-center text-lg tracking-[0.5em] text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 disabled:opacity-60"
                placeholder="______"
              />

              <button
                type="submit"
                disabled={verifyStatus === "verifying" || otpCode.length !== 6}
                className="mt-4 w-full rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white shadow-[0_4px_0_0_var(--color-cobalt-hover)] transition-all duration-150 hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-atlas-cobalt focus:ring-offset-2 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-cobalt-hover)] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0"
              >
                {verifyStatus === "verifying" ? "Verifying…" : "Verify Code"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={!registeredEmail || resendCooldown > 0 || resendStatus === "sending"}
                className="mt-3 w-full rounded-lg border border-[var(--color-border-medium)] py-2.5 text-sm font-semibold text-atlas-cobalt transition-colors hover:bg-[var(--color-cobalt-soft)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendCooldown > 0
                  ? `Resend code (${resendCooldown}s)`
                  : resendStatus === "sending"
                    ? "Sending…"
                    : "Resend code"}
              </button>
              {resendStatus === "sent" && resendCooldown === RESEND_COOLDOWN_SECONDS && (
                <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                  If that address has a pending account, a new code is on its way.
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
