import { SignInContent } from "@/components/auth/SignInContent";
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

const loginMock = vi.fn();
const completeOAuthSignupMock = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    login: (...args: Parameters<typeof actual.login>) => loginMock(...args),
    completeOAuthSignup: (...args: Parameters<typeof actual.completeOAuthSignup>) =>
      completeOAuthSignupMock(...args),
  };
});

const LOGIN_RESULT = {
  user: {
    id: "abc-123",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    organizationName: "Example Org",
    roleOrUseCase: "developer",
    status: "active" as const,
    createdAt: "2026-08-13T00:00:00Z",
  },
  message: "Signed in successfully.",
};

function fillCredentials(email = "ada@example.com", password = "hunter2") {
  fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("SignInContent", () => {
  beforeEach(() => {
    loginMock.mockReset();
    completeOAuthSignupMock.mockReset();
    googleOauthMock.isGoogleSignInConfigured.mockReturnValue(true);
    githubOauthMock.isGitHubSignInConfigured.mockReturnValue(true);
    searchParams = new URLSearchParams();
    loginMock.mockResolvedValue(LOGIN_RESULT);
  });

  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("signs in with real credentials, stores the session, and goes to /explore", async () => {
    render(<SignInContent />);
    fillCredentials();
    submit();

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith({ email: "ada@example.com", password: "hunter2" }));
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    );
    expect(routerPushMock).toHaveBeenCalledWith("/explore");
  });

  it("keeps the demo account working without calling the API", async () => {
    render(<SignInContent />);
    fillCredentials("demo@gmail.com", "Demo@123");
    submit();

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith("/explore"));
    expect(loginMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "demo@gmail.com", name: "Arjun Singh" }),
    );
  });

  it("shows the backend message for invalid credentials", async () => {
    loginMock.mockRejectedValue(
      new ApiRequestError("INVALID_CREDENTIALS", "Invalid email or password.", 401),
    );

    render(<SignInContent />);
    fillCredentials();
    submit();

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(screen.queryByText(/demo@gmail.com/i)).not.toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("points unverified accounts at the verification step", async () => {
    loginMock.mockRejectedValue(
      new ApiRequestError("EMAIL_NOT_VERIFIED", "Please verify your email before signing in.", 403),
    );

    render(<SignInContent />);
    fillCredentials();
    submit();

    expect(await screen.findByText(/isn't verified yet/i)).toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("shows a connection error when the API is unreachable", async () => {
    loginMock.mockRejectedValue(new ApiUnavailableError(new Error("network down")));

    render(<SignInContent />);
    fillCredentials();
    submit();

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it("starts Google sign-in with the signin return route", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock },
    });

    render(<SignInContent />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    await waitFor(() =>
      expect(googleOauthMock.buildGoogleAuthUrl).toHaveBeenCalledWith("/signin"),
    );
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

    render(<SignInContent />);
    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(
      await screen.findByText(/google sign-in isn't configured yet/i),
    ).toBeInTheDocument();
    expect(googleOauthMock.buildGoogleAuthUrl).not.toHaveBeenCalled();
  });

  it("starts GitHub sign-in with the signin return route", async () => {
    const assignMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: assignMock },
    });

    render(<SignInContent />);
    fireEvent.click(screen.getByRole("button", { name: /continue with github/i }));

    await waitFor(() =>
      expect(githubOauthMock.buildGitHubAuthUrl).toHaveBeenCalledWith("/signin"),
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

  it("completes an OAuth round-trip and signs the user in", async () => {
    searchParams = new URLSearchParams({ oauth_session: "ticket-abc" });
    completeOAuthSignupMock.mockResolvedValue({
      user: {
        id: "abc-123",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: null,
        roleOrUseCase: "developer",
        status: "active",
        createdAt: "2026-08-13T00:00:00Z",
      },
      message: "Signed in with Google.",
    });

    render(<SignInContent />);

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/explore"));
    expect(completeOAuthSignupMock).toHaveBeenCalledWith("ticket-abc");
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    );
  });

  it("shows an error when the OAuth ticket is invalid", async () => {
    searchParams = new URLSearchParams({ oauth_session: "expired" });
    completeOAuthSignupMock.mockRejectedValue(
      new ApiRequestError(
        "GOOGLE_SESSION_INVALID",
        "This sign-in session is invalid or has expired.",
        401,
      ),
    );

    render(<SignInContent />);

    expect(await screen.findByText(/sign-in couldn't be completed/i)).toBeInTheDocument();
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });
});
