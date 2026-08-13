"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/layout/Footer";
import { ApiRequestError, ApiUnavailableError, resendVerificationEmail, verifyEmail } from "@/lib/api-client";
import { signInUser } from "@/lib/session";
import type { RegisteredUser } from "@/types/auth";

type VerificationState = "entering" | "verifying" | "success" | "error";

const RESEND_COOLDOWN_SECONDS = 60;
const OTP_CODE_PATTERN = /^\d{6}$/;

export function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [state, setState] = useState<VerificationState>("entering");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [verifiedUser, setVerifiedUser] = useState<RegisteredUser | null>(null);
  const verifyingRef = useRef(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Enter the email address you signed up with.");
      return;
    }
    if (!OTP_CODE_PATTERN.test(code)) {
      setErrorMessage("Enter the 6-digit code we sent you.");
      return;
    }
    if (verifyingRef.current) {
      return;
    }

    verifyingRef.current = true;
    setState("verifying");
    setErrorMessage(null);

    try {
      const result = await verifyEmail({ email: trimmedEmail, code });
      setVerifiedUser(result.user);
      setState("success");
    } catch (error) {
      setState("error");
      if (error instanceof ApiRequestError) {
        setErrorMessage(error.message);
      } else if (error instanceof ApiUnavailableError) {
        setErrorMessage("We couldn't reach the server. Check your connection and try again.");
      } else {
        setErrorMessage("Something went wrong while verifying your email.");
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

  /** Verification activates the account — "Sign In" therefore needs no
   *  credentials: establish the session from the verified user and go
   *  straight to the explore page. */
  const handleAutoSignIn = () => {
    if (verifiedUser) {
      signInUser({ email: verifiedUser.email, name: verifiedUser.fullName });
    }
    router.push("/explore");
  };

  const handleResend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || resendCooldown > 0 || resendStatus === "sending") {
      return;
    }
    setResendStatus("sending");
    try {
      await resendVerificationEmail(trimmedEmail);
    } catch {
      // Resend uses a generic response even on failure to avoid account
      // enumeration — no distinct error state to show here.
    }
    setResendStatus("sent");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setCode("");
    if (state === "error") {
      setState("entering");
      setErrorMessage(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="geospatial-background flex-1">
        <div className="mx-auto max-w-content px-6 py-16 lg:px-16 lg:py-20">
          <div className="mx-auto max-w-md rounded-[var(--radius-large)] border border-[var(--color-border-subtle)] bg-white p-8 text-center shadow-card lg:p-10">
            {/* Step Indicator */}
            <div className="mb-8 flex items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)] text-sm font-semibold text-atlas-cobalt">
                  1
                </div>
                <span className="text-sm font-medium text-obsidian-graphite/50">Account Details</span>
              </div>
              <div className="h-px w-8 bg-[var(--color-border-medium)]" />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-atlas-cobalt text-sm font-semibold text-white">
                  2
                </div>
                <span className="text-sm font-medium text-obsidian-graphite">Verify Email</span>
              </div>
            </div>

            {state === "success" ? (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">Email verified successfully.</h1>
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
              </>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)]">
                  <Mail className="h-7 w-7 text-atlas-cobalt" />
                </div>
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">Enter your verification code</h1>
                <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                  Enter the email you signed up with and the 6-digit code we sent to activate your
                  account.
                </p>

                {errorMessage && (
                  <div
                    role="alert"
                    className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{errorMessage}</p>
                  </div>
                )}

                <label htmlFor="email" className="mb-2 block text-left text-sm font-medium text-obsidian-graphite">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))}
                  disabled={state === "verifying"}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 mb-4 w-full rounded-lg border border-[var(--color-border-medium)] bg-white px-4 py-2.5 text-sm text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 disabled:opacity-60"
                  placeholder="you@company.com"
                />

                <label htmlFor="otpCode" className="mb-2 block text-left text-sm font-medium text-obsidian-graphite">
                  Enter the 6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  id="otpCode"
                  name="otpCode"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={state === "verifying"}
                  className="placeholder-obsidian-graphite/40 focus:ring-atlas-cobalt/20 w-full rounded-lg border border-[var(--color-border-medium)] bg-white px-4 py-2.5 text-center text-lg tracking-[0.5em] text-obsidian-graphite transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-2 disabled:opacity-60"
                  placeholder="______"
                />

                <button
                  type="submit"
                  disabled={state === "verifying" || code.length !== 6 || !email.trim()}
                  className="mt-4 w-full rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === "verifying" ? "Verifying…" : "Verify Code"}
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!email.trim() || resendCooldown > 0 || resendStatus === "sending"}
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
        </div>
      </main>

      <Footer />
    </div>
  );
}
