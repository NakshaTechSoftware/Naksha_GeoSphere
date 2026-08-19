"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  ApiRequestError,
  ApiUnavailableError,
  completeOAuthSignup,
  login,
} from "@/lib/api-client";
import { buildGitHubAuthUrl, isGitHubSignInConfigured } from "@/lib/github-oauth";
import { buildGoogleAuthUrl, isGoogleSignInConfigured } from "@/lib/google-oauth";
import { signInUser } from "@/lib/session";
import { SignInBenefits } from "./SignInBenefits";

// Development-stage demo account: signs in without touching the API so the
// explore flow can be tested without a registered account.
const DEMO_EMAIL = "demo@gmail.com";
const DEMO_PASSWORD = "Demo@123";
const DEMO_NAME = "Arjun Singh";

export function SignInContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  /** Starts the Google authorization-code flow (PKCE); the browser leaves
   *  the app and returns to `/signin?oauth_session=<ticket>` afterwards. */
  const handleGoogleSignIn = async () => {
    if (!isGoogleSignInConfigured()) {
      setError("Google sign-in isn't configured yet. Use email sign-in for now.");
      return;
    }
    try {
      const authUrl = await buildGoogleAuthUrl("/signin");
      window.location.assign(authUrl);
    } catch {
      setError("Couldn't start Google sign-in. Please try again.");
    }
  };

  /** Starts the GitHub authorization-code flow; the browser leaves the app
   *  and returns to `/signin?oauth_session=<ticket>` afterwards. */
  const handleGitHubSignIn = async () => {
    if (!isGitHubSignInConfigured()) {
      setError("GitHub sign-in isn't configured yet. Use email sign-in for now.");
      return;
    }
    try {
      window.location.assign(buildGitHubAuthUrl("/signin"));
    } catch {
      setError("Couldn't start GitHub sign-in. Please try again.");
    }
  };

  // Completes an OAuth round-trip (Google or GitHub): the backend exchanged
  // the code and redirected here with a one-time ticket — swap it for the
  // user and sign in.
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
          setError("Sign-in couldn't be completed. Please try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    setError("");
    setIsLoading(true);

    // Demo credentials short-circuit the real authentication.
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      signInUser({ email: DEMO_EMAIL, name: DEMO_NAME });
      router.push("/explore");
      return;
    }

    try {
      const result = await login({ email, password });
      signInUser({ email: result.user.email, name: result.user.fullName });
      router.push("/explore");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errorCode === "EMAIL_NOT_VERIFIED") {
          setError(
            "Your email isn't verified yet. Check your inbox for the 6-digit code we sent you.",
          );
        } else if (err.errorCode === "INVALID_CREDENTIALS") {
          setError("Invalid email or password.");
        } else {
          setError(err.message);
        }
      } else if (err instanceof ApiUnavailableError) {
        setError("We couldn't reach the server. Check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-content px-6 py-12 lg:px-16">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left Column - Welcome Back Section. Hidden on mobile (common phone
            resolutions) so the sign-in form gets the full width. */}
        <div className="hidden lg:block">
          <SignInBenefits />
        </div>

        {/* Right Column - Sign In Form */}
        <div className="flex items-start justify-center lg:pt-8">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
              {/* Form Header */}
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-obsidian-graphite">
                  Sign in to your account
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Access your datasets, downloads, and workspace.
                </p>
              </div>

              {/* Sign In Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Error Message */}
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="sr-only">
                    Work Email
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Work Email"
                      className="block w-full rounded-lg border border-gray-300 bg-white py-3.5 pl-12 pr-4 text-sm text-obsidian-graphite placeholder-gray-400 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-1 focus:ring-atlas-cobalt"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="block w-full rounded-lg border border-gray-300 bg-white py-3.5 pl-12 pr-12 text-sm text-obsidian-graphite placeholder-gray-400 transition-colors focus:border-atlas-cobalt focus:outline-none focus:ring-1 focus:ring-atlas-cobalt"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-atlas-cobalt focus:ring-atlas-cobalt"
                    />
                    <label
                      htmlFor="remember-me"
                      className="ml-2 block text-sm text-gray-700"
                    >
                      Remember me
                    </label>
                  </div>
                  <a
                    href="/forgot-password"
                    className="text-sm font-medium text-atlas-cobalt hover:text-atlas-cobalt/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
                  >
                    Forgot Password?
                  </a>
                </div>

                {/* Sign In Button */}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isLoading}
                  className="w-full py-3.5 text-base font-medium"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-4 text-gray-500">or continue with</span>
                  </div>
                </div>

                {/* Social Sign In Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
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
                    onClick={handleGitHubSignIn}
                    className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
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

                {/* Create Account Link */}
                <p className="text-center text-sm text-gray-600">
                  Don&apos;t have an account?{" "}
                  <a
                    href="/signup"
                    className="font-medium text-atlas-cobalt hover:text-atlas-cobalt/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
                  >
                    Create one
                  </a>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
