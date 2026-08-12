"use client";

import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SignInBenefits } from "./SignInBenefits";

export function SignInContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    setError("");
    setIsLoading(true);

    console.log("Form submitted with:", { email, password });

    // Test credentials
    if (email === "demo@gmail.com" && password === "Demo@123") {
      console.log("Credentials match! Redirecting...");
      
      // Store user info in sessionStorage for demo purposes
      if (typeof window !== "undefined") {
        sessionStorage.setItem("user", JSON.stringify({ email, name: "Arjun Singh" }));
      }
      
      // Redirect to the explore page after sign-in
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log("Attempting redirect to /explore");
      
      if (typeof window !== "undefined") {
        window.location.href = "/explore";
      }
    } else {
      console.log("Credentials do not match");
      setIsLoading(false);
      setError("Invalid email or password. Use demo@gmail.com / Demo@123 for testing.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-content px-6 py-12 lg:px-16">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left Column - Welcome Back Section */}
        <SignInBenefits />

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
                {/* Test Credentials Info */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm">
                  <p className="font-medium text-blue-900 mb-1">🧪 Testing Credentials</p>
                  <p className="text-blue-800">
                    <strong>Email:</strong> demo@gmail.com<br />
                    <strong>Password:</strong> Demo@123
                  </p>
                </div>

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
                  onClick={(e) => {
                    console.log("Button clicked!");
                  }}
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
                    className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atlas-cobalt focus-visible:ring-offset-2"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        fill="#00A4EF"
                        d="M0 0h11.377v11.372H0V0zm12.623 0H24v11.372H12.623V0zM0 12.623h11.377V24H0V12.623zm12.623 0H24V24H12.623V12.623z"
                      />
                    </svg>
                    Continue with Microsoft
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

              {/* Security Note */}
              <div className="mt-8 flex items-start gap-3 rounded-lg bg-gray-50 p-4">
                <Shield className="h-5 w-5 flex-shrink-0 text-atlas-cobalt" />
                <div className="text-xs text-gray-600">
                  <p className="font-medium">Your data is protected with enterprise-grade security.</p>
                  <p className="mt-1">
                    We never share your information. Trusted by professionals worldwide.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
