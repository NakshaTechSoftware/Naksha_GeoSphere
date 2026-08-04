"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Building, Briefcase, Lock, Eye, EyeOff, Shield, AlertCircle } from "lucide-react";
import { ApiRequestError, ApiUnavailableError, registerAccount } from "@/lib/api-client";

type Step = "account" | "verify";
type SubmitStatus = "idle" | "submitting" | "error";

const ROLE_OPTIONS = [
  { value: "gis-analyst", label: "GIS Analyst" },
  { value: "researcher", label: "Researcher" },
  { value: "developer", label: "Developer" },
  { value: "data-scientist", label: "Data Scientist" },
  { value: "engineer", label: "Engineer" },
  { value: "manager", label: "Manager" },
  { value: "other", label: "Other" },
];

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!formData.organization.trim()) {
    errors.organization = "Organization / Company is required.";
  }
  if (!formData.role) {
    errors.role = "Select a role or use case.";
  }
  if (formData.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
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
  const router = useRouter();
  const [currentStep] = useState<Step>("account");
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
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const submittingRef = useRef(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Belt-and-braces guard against double submission (fast double-click
    // before React re-renders the disabled button).
    if (submittingRef.current) {
      return;
    }

    setFormError(null);
    setDuplicateEmail(false);

    const errors = validate(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    submittingRef.current = true;
    setStatus("submitting");

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

      router.push(`/verify-email?email=${encodeURIComponent(result.user.email)}`);
      // Deliberately leave `status` as "submitting" — the button should
      // stay disabled through the navigation instead of flashing back
      // to idle before the route changes.
    } catch (error) {
      submittingRef.current = false;
      setStatus("error");

      if (error instanceof ApiRequestError) {
        if (error.errorCode === "EMAIL_ALREADY_REGISTERED") {
          setDuplicateEmail(true);
        } else if (error.errorCode === "VALIDATION_ERROR" && error.fields) {
          const mapped: Record<string, string> = {};
          for (const [key, message] of Object.entries(error.fields)) {
            mapped[BACKEND_TO_FORM_FIELD[key] ?? key] = message;
          }
          setFieldErrors(mapped);
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
    }
  };

  const handleSocialSignup = () => {
    // Not implemented in this phase — buttons are intentionally inert.
  };

  const isSubmitting = status === "submitting";

  return (
    <div className="rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 shadow-card lg:p-10">
      {/* Step Indicator */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
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

        <div className="h-px flex-1 bg-[var(--color-border-medium)]" />

        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
              currentStep === "verify"
                ? "bg-atlas-cobalt text-white"
                : "bg-[var(--color-border-subtle)] text-obsidian-graphite/40"
            }`}
          >
            2
          </div>
          <span
            className={`text-sm font-medium ${
              currentStep === "verify" ? "text-obsidian-graphite" : "text-obsidian-graphite/50"
            }`}
          >
            Verify Email
          </span>
        </div>
      </div>

      {/* Form Title */}
      <h2 className="mb-2 text-2xl font-bold text-obsidian-graphite">Create your account</h2>
      <p className="mb-6 text-sm text-[var(--color-text-secondary)]">Step 1 of 2</p>

      {/* Form-level error */}
      {(formError || duplicateEmail) && (
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
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <input
              type="text"
              id="fullName"
              name="fullName"
              value={formData.fullName}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.fullName)}
              className="w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite placeholder-obsidian-graphite/40 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
              placeholder="Enter your full name"
            />
          </div>
          {fieldErrors.fullName && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.fullName}</p>}
        </div>

        {/* Work Email */}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Work Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.email)}
              className="w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite placeholder-obsidian-graphite/40 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
              placeholder="you@company.com"
            />
          </div>
          {fieldErrors.email && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.email}</p>}
        </div>

        {/* Organization / Company */}
        <div>
          <label htmlFor="organization" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Organization / Company
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <input
              type="text"
              id="organization"
              name="organization"
              value={formData.organization}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.organization)}
              className="w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-4 text-sm text-obsidian-graphite placeholder-obsidian-graphite/40 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
              placeholder="Your organization"
            />
          </div>
          {fieldErrors.organization && (
            <p className="mt-1.5 text-xs text-red-600">{fieldErrors.organization}</p>
          )}
        </div>

        {/* Role or Use Case */}
        <div>
          <label htmlFor="role" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Role or Use Case
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.role)}
              className="w-full appearance-none rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
            >
              <option value="">Select your role</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-5 w-5 text-obsidian-graphite/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {fieldErrors.role && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.role}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <input
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.password)}
              className="w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite placeholder-obsidian-graphite/40 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
              placeholder="Create a strong password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-graphite/40 hover:text-obsidian-graphite"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1.5 text-xs text-red-600">{fieldErrors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-obsidian-graphite">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-obsidian-graphite/40" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              className="w-full rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 pl-10 pr-10 text-sm text-obsidian-graphite placeholder-obsidian-graphite/40 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 focus:ring-atlas-cobalt/20 disabled:opacity-60"
              placeholder="Confirm your password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-obsidian-graphite/40 hover:text-obsidian-graphite"
            >
              {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
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
            disabled={isSubmitting}
            className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-medium)] text-atlas-cobalt focus:ring-2 focus:ring-atlas-cobalt/20"
          />
          <label htmlFor="agreeToTerms" className="text-sm text-obsidian-graphite">
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
        {fieldErrors.agreeToTerms && <p className="-mt-3 text-xs text-red-600">{fieldErrors.agreeToTerms}</p>}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)] focus:outline-none focus:ring-2 focus:ring-atlas-cobalt focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Creating account…" : "Create Account"}
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-border-medium)]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-4 text-obsidian-graphite/60">or continue with</span>
          </div>
        </div>

        {/* Social Signup */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleSocialSignup}
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
            onClick={handleSocialSignup}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border-medium)] bg-white py-2.5 text-sm font-medium text-obsidian-graphite transition-colors hover:bg-[var(--color-cobalt-soft)]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M13 1h10v10H13z" />
              <path fill="#05a6f0" d="M1 13h10v10H1z" />
              <path fill="#ffba08" d="M13 13h10v10H13z" />
            </svg>
            Continue with Microsoft
          </button>
        </div>
      </form>

      {/* Security Note */}
      <div className="mt-6 flex items-start gap-2 rounded-lg bg-[var(--color-cobalt-soft)] p-4">
        <Shield className="h-5 w-5 shrink-0 text-atlas-cobalt" />
        <p className="text-xs leading-relaxed text-obsidian-graphite">
          Your data is protected with enterprise-grade security. We never share your information.
          Trusted by professionals worldwide.
        </p>
      </div>
    </div>
  );
}
