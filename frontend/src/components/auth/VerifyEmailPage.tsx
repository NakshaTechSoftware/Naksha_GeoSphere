"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/layout/Footer";
import { ApiRequestError, ApiUnavailableError, resendVerificationEmail, verifyEmail } from "@/lib/api-client";

type VerificationState = "pending" | "verifying" | "success" | "error";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const emailFromQuery = searchParams.get("email") ?? "";

  const [state, setState] = useState<VerificationState>(token ? "verifying" : "pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");
  const verifyAttempted = useRef(false);

  useEffect(() => {
    if (!token || verifyAttempted.current) {
      return;
    }
    verifyAttempted.current = true;

    void (async () => {
      try {
        await verifyEmail(token);
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
      }
    })();
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async () => {
    if (!emailFromQuery || resendCooldown > 0 || resendStatus === "sending") {
      return;
    }
    setResendStatus("sending");
    try {
      await resendVerificationEmail(emailFromQuery);
    } catch {
      // Resend uses a generic response even on failure to avoid account
      // enumeration — no distinct error state to show here.
    }
    setResendStatus("sent");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
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

            {state === "verifying" && (
              <>
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-atlas-cobalt" />
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">Verifying your email…</h1>
                <p className="text-sm text-[var(--color-text-secondary)]">This will only take a moment.</p>
              </>
            )}

            {state === "pending" && (
              <>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-cobalt-soft)]">
                  <Mail className="h-7 w-7 text-atlas-cobalt" />
                </div>
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">
                  Account created. Check your email to continue.
                </h1>
                <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                  {emailFromQuery ? (
                    <>
                      We sent a verification link to{" "}
                      <span className="font-medium text-obsidian-graphite">{emailFromQuery}</span>.
                    </>
                  ) : (
                    "We sent a verification link to your inbox."
                  )}{" "}
                  Click the link to activate your account.
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!emailFromQuery || resendCooldown > 0 || resendStatus === "sending"}
                  className="w-full rounded-lg border border-[var(--color-border-medium)] py-2.5 text-sm font-semibold text-atlas-cobalt transition-colors hover:bg-[var(--color-cobalt-soft)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendCooldown > 0
                    ? `Resend link (${resendCooldown}s)`
                    : resendStatus === "sending"
                      ? "Sending…"
                      : "Resend verification email"}
                </button>
                {resendStatus === "sent" && resendCooldown === RESEND_COOLDOWN_SECONDS && (
                  <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                    If that address has a pending account, a new link is on its way.
                  </p>
                )}
              </>
            )}

            {state === "success" && (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" />
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">Email verified successfully.</h1>
                <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                  Your account is now active. You can sign in whenever you&rsquo;re ready.
                </p>
                <a
                  href="/login"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)]"
                >
                  Sign In
                </a>
              </>
            )}

            {state === "error" && (
              <>
                <XCircle className="mx-auto mb-4 h-12 w-12 text-red-600" />
                <h1 className="mb-2 text-xl font-bold text-obsidian-graphite">Verification link invalid</h1>
                <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
                  {errorMessage ?? "This verification link is invalid or has expired."}
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!emailFromQuery || resendCooldown > 0 || resendStatus === "sending"}
                  className="w-full rounded-lg bg-atlas-cobalt py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-cobalt-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Resend link (${resendCooldown}s)` : "Send a new link"}
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
