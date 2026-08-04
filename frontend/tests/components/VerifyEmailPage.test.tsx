import { VerifyEmailPage } from "@/components/auth/VerifyEmailPage";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const verifyEmailMock = vi.fn();
const resendVerificationEmailMock = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    verifyEmail: (...args: Parameters<typeof actual.verifyEmail>) => verifyEmailMock(...args),
    resendVerificationEmail: (...args: Parameters<typeof actual.resendVerificationEmail>) =>
      resendVerificationEmailMock(...args),
  };
});

describe("VerifyEmailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it("shows the pending 'check your email' state when there is no token", () => {
    searchParams = new URLSearchParams({ email: "ada@example.com" });
    render(<VerifyEmailPage />);

    expect(screen.getByText(/check your email to continue/i)).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("verifies automatically and shows success when a token is present", async () => {
    verifyEmailMock.mockResolvedValue({ status: "active", message: "Email verified successfully." });
    searchParams = new URLSearchParams({ token: "raw-token-value" });

    render(<VerifyEmailPage />);

    expect(await screen.findByText("Email verified successfully.")).toBeInTheDocument();
    expect(verifyEmailMock).toHaveBeenCalledWith("raw-token-value");
  });

  it("shows an error state for an invalid or expired token", async () => {
    const { ApiRequestError } = await import("@/lib/api-client");
    verifyEmailMock.mockRejectedValue(
      new ApiRequestError(
        "INVALID_OR_EXPIRED_TOKEN",
        "This verification link is invalid or has expired.",
        422,
      ),
    );
    searchParams = new URLSearchParams({ token: "bad-token" });

    render(<VerifyEmailPage />);

    expect(await screen.findByText("Verification link invalid")).toBeInTheDocument();
  });
});
