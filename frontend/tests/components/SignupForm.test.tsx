import { SignupForm } from "@/components/auth/SignupForm";
import { ApiRequestError, ApiUnavailableError } from "@/lib/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock, replace: routerReplaceMock }),
  useSearchParams: () => searchParams,
}));

const googleOauthMock = vi.hoisted(() => ({
  isGoogleSignInConfigured: vi.fn(() => true),
  buildGoogleAuthUrl: vi.fn(async () => "https://accounts.google.com/o/oauth2/v2/auth?state=x"),
}));

vi.mock("@/lib/google-oauth", () => googleOauthMock);

const githubOauthMock = vi.hoisted(() => ({
  isGitHubSignInConfigured: vi.fn(() => true),
  buildGitHubAuthUrl: vi.fn(() => "https://github.com/login/oauth/authorize?state=x"),
}));

vi.mock("@/lib/github-oauth", () => githubOauthMock);

const registerAccountMock = vi.fn();
const verifyEmailMock = vi.fn();
const resendVerificationEmailMock = vi.fn();
const completeOAuthSignupMock = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    registerAccount: (...args: Parameters<typeof actual.registerAccount>) =>
      registerAccountMock(...args),
    verifyEmail: (...args: Parameters<typeof actual.verifyEmail>) => verifyEmailMock(...args),
    resendVerificationEmail: (...args: Parameters<typeof actual.resendVerificationEmail>) =>
      resendVerificationEmailMock(...args),
    completeOAuthSignup: (...args: Parameters<typeof actual.completeOAuthSignup>) =>
      completeOAuthSignupMock(...args),
  };
});

const REGISTER_RESULT = {
  user: { fullName: "Ada Lovelace", email: "ada@example.com" },
  nextStep: "verify_email" as const,
  message: "Account created.",
};

const VERIFY_RESULT = {
  status: "active" as const,
  message: "Email verified successfully.",
  user: {
    id: "abc-123",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    organizationName: "Example Org",
    roleOrUseCase: "developer",
    status: "active" as const,
    createdAt: "2026-08-13T00:00:00Z",
  },
};

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText("Organization / Company"), {
    target: { value: "Example Org" },
  });
  fireEvent.change(screen.getByLabelText("Role or Use Case"), { target: { value: "developer" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "Str0ng-Passw0rd-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: "Str0ng-Passw0rd-123" },
  });
  fireEvent.click(screen.getByLabelText(/I agree to the/));
}

function submitAccountForm() {
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

/** Fills the form, submits, and waits until Step 2's OTP input renders. */
async function reachVerifyStep() {
  fillValidForm();
  submitAccountForm();
  await screen.findByLabelText("Enter the 6-digit code");
}

function enterOtpCode(code = "123456") {
  fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), { target: { value: code } });
}

function clickVerify() {
  fireEvent.click(screen.getByRole("button", { name: /verify code/i }));
}

describe("SignupForm", () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
    verifyEmailMock.mockReset();
    resendVerificationEmailMock.mockReset();
    completeOAuthSignupMock.mockReset();
    googleOauthMock.isGoogleSignInConfigured.mockReturnValue(true);
    githubOauthMock.isGitHubSignInConfigured.mockReturnValue(true);
    searchParams = new URLSearchParams();
    registerAccountMock.mockResolvedValue(REGISTER_RESULT);
    resendVerificationEmailMock.mockResolvedValue({ message: "If an account exists..." });
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("does not submit when required fields are empty", () => {
    render(<SignupForm />);

    // The submit button is gated on accepting the terms, which is gated on
    // the required fields — with an empty form there is nothing to click.
    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
    submitAccountForm();

    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email address", () => {
    render(<SignupForm />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });

    submitAccountForm();

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", () => {
    render(<SignupForm />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "a-different-password-1" },
    });

    submitAccountForm();

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("requires the terms checkbox to be checked before submitting", () => {
    render(<SignupForm />);
    fillValidForm();
    const checkbox = screen.getByLabelText(/I agree to the/);
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox); // uncheck

    expect(screen.getByRole("button", { name: /create account/i })).toBeDisabled();
    submitAccountForm();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("registers directly on submit and shows the OTP entry step", async () => {
    render(<SignupForm />);
    await reachVerifyStep();

    expect(registerAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: "Example Org",
        roleOrUseCase: "developer",
      }),
    );
    expect(screen.getByText(/we sent a 6-digit code to/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("Verify Email")).toBeInTheDocument();
  });

  it("shows a submitting state and disables the button while registering", async () => {
    let resolveRegister: ((value: typeof REGISTER_RESULT) => void) | undefined;
    registerAccountMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRegister = resolve;
      }),
    );

    render(<SignupForm />);
    fillValidForm();
    submitAccountForm();

    const button = await screen.findByRole("button", { name: /creating account/i });
    expect(button).toBeDisabled();

    resolveRegister?.(REGISTER_RESULT);
    await waitFor(() =>
      expect(screen.getByLabelText("Enter the 6-digit code")).toBeInTheDocument(),
    );
  });

  it("shows a duplicate-email message when the email is already registered", async () => {
    registerAccountMock.mockRejectedValue(
      new ApiRequestError(
        "EMAIL_ALREADY_REGISTERED",
        "An account already exists for this email.",
        409,
      ),
    );

    render(<SignupForm />);
    fillValidForm();
    submitAccountForm();

    expect(
      await screen.findByText(/an account already exists for this email/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    // Stays on the account step so the user can edit and retry.
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("maps field-level VALIDATION_ERROR responses onto the form", async () => {
    registerAccountMock.mockRejectedValue(
      new ApiRequestError("VALIDATION_ERROR", "One or more fields are invalid.", 422, {
        email: "value is not a valid email address",
      }),
    );

    render(<SignupForm />);
    fillValidForm();
    submitAccountForm();

    expect(await screen.findByText("value is not a valid email address")).toBeInTheDocument();
  });

  it("shows a retry message on a network failure during registration", async () => {
    registerAccountMock.mockRejectedValue(new ApiUnavailableError(new Error("network down")));

    render(<SignupForm />);
    fillValidForm();
    submitAccountForm();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeEnabled();
  });

  it("never writes the password to localStorage or sessionStorage", async () => {
    render(<SignupForm />);
    await reachVerifyStep();

    const haystack = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
      JSON.stringify(localStorage),
      JSON.stringify(sessionStorage),
    ].join(" ");
    expect(haystack).not.toContain("Str0ng-Passw0rd-123");
  });

  it("requires a full 6-digit code before enabling Verify", async () => {
    render(<SignupForm />);
    await reachVerifyStep();

    const verifyButton = screen.getByRole("button", { name: /verify code/i });
    expect(verifyButton).toBeDisabled();
    enterOtpCode("123");
    expect(verifyButton).toBeDisabled();
    enterOtpCode("123456");
    expect(verifyButton).toBeEnabled();
  });

  it("verifies the code and auto-signs-in to the explore page", async () => {
    verifyEmailMock.mockResolvedValue(VERIFY_RESULT);

    render(<SignupForm />);
    await reachVerifyStep();
    enterOtpCode();
    clickVerify();

    await waitFor(() =>
      expect(verifyEmailMock).toHaveBeenCalledWith({ email: "ada@example.com", code: "123456" }),
    );
    expect(await screen.findByText(/email verified successfully/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    );
    expect(routerPushMock).toHaveBeenCalledWith("/explore");
  });

  it("shows an error for an invalid or expired code and allows resend", async () => {
    verifyEmailMock.mockRejectedValue(
      new ApiRequestError(
        "INVALID_OR_EXPIRED_CODE",
        "This verification code is invalid or has expired.",
        422,
      ),
    );

    render(<SignupForm />);
    await reachVerifyStep();
    enterOtpCode();
    clickVerify();

    expect(
      await screen.findByText(/this verification code is invalid or has expired/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend code/i })).toBeInTheDocument();
  });

  it("resend clears the code and refetches a new one", async () => {
    render(<SignupForm />);
    await reachVerifyStep();
    enterOtpCode();

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() => expect(resendVerificationEmailMock).toHaveBeenCalledWith("ada@example.com"));
    expect(screen.getByLabelText("Enter the 6-digit code")).toHaveValue("");
  });

  it("shows a retry message on a network failure during verification", async () => {
    verifyEmailMock.mockRejectedValue(new ApiUnavailableError(new Error("network down")));

    render(<SignupForm />);
    await reachVerifyStep();
    enterOtpCode();
    clickVerify();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it("starts Google sign-in from the Continue with Google button", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock },
    });

    render(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() => expect(googleOauthMock.buildGoogleAuthUrl).toHaveBeenCalled());
    expect(assignMock).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=x",
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("tells the user when Google sign-in isn't configured", async () => {
    googleOauthMock.isGoogleSignInConfigured.mockReturnValue(false);

    render(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(
      await screen.findByText(/google sign-in isn't configured yet/i),
    ).toBeInTheDocument();
    expect(googleOauthMock.buildGoogleAuthUrl).not.toHaveBeenCalled();
  });

  it("starts GitHub sign-in from the Continue with GitHub button", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock },
    });

    render(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: /continue with github/i }));

    await waitFor(() =>
      expect(githubOauthMock.buildGitHubAuthUrl).toHaveBeenCalledWith("/signup"),
    );
    expect(assignMock).toHaveBeenCalledWith(
      "https://github.com/login/oauth/authorize?state=x",
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("tells the user when GitHub sign-in isn't configured", async () => {
    githubOauthMock.isGitHubSignInConfigured.mockReturnValue(false);

    render(<SignupForm />);
    fireEvent.click(screen.getByRole("button", { name: /continue with github/i }));

    expect(
      await screen.findByText(/github sign-in isn't configured yet/i),
    ).toBeInTheDocument();
    expect(githubOauthMock.buildGitHubAuthUrl).not.toHaveBeenCalled();
  });

  it("completes an OAuth round-trip and signs the user in", async () => {
    searchParams = new URLSearchParams({ oauth_session: "ticket-123" });
    completeOAuthSignupMock.mockResolvedValue({
      user: {
        id: "abc-123",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: "Example Org",
        roleOrUseCase: "developer",
        status: "active",
        createdAt: "2026-08-13T00:00:00Z",
      },
      message: "Signed in with Google.",
    });

    render(<SignupForm />);

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/explore"));
    expect(completeOAuthSignupMock).toHaveBeenCalledWith("ticket-123");
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    );
  });

  it("shows an error when the OAuth ticket is invalid", async () => {
    searchParams = new URLSearchParams({ oauth_session: "expired-ticket" });
    completeOAuthSignupMock.mockRejectedValue(
      new ApiRequestError(
        "GOOGLE_SESSION_INVALID",
        "This sign-in session is invalid or has expired.",
        401,
      ),
    );

    render(<SignupForm />);

    expect(await screen.findByText(/sign-in couldn't be completed/i)).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
