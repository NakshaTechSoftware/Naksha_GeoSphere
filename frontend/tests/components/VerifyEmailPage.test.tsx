import { VerifyEmailPage } from "@/components/auth/VerifyEmailPage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();
const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: routerPushMock }),
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

function enterCode(code = "123456") {
  fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), { target: { value: code } });
}

function clickVerify() {
  fireEvent.click(screen.getByRole("button", { name: /verify code/i }));
}

describe("VerifyEmailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    sessionStorage.clear();
  });

  it("prefills the email from the query string", () => {
    searchParams = new URLSearchParams({ email: "ada@example.com" });
    render(<VerifyEmailPage />);

    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
  });

  it("disables Verify until a full 6-digit code and an email are present", () => {
    render(<VerifyEmailPage />);

    const verifyButton = screen.getByRole("button", { name: /verify code/i });
    expect(verifyButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    expect(verifyButton).toBeDisabled();

    enterCode("123456");
    expect(verifyButton).toBeEnabled();
  });

  it("verifies the code and auto-signs-in to the explore page", async () => {
    verifyEmailMock.mockResolvedValue({
      status: "active",
      message: "Email verified successfully.",
      user: {
        id: "abc-123",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: null,
        roleOrUseCase: "developer",
        status: "active",
        createdAt: "2026-08-13T00:00:00Z",
      },
    });
    searchParams = new URLSearchParams({ email: "ada@example.com" });

    render(<VerifyEmailPage />);
    enterCode();
    clickVerify();

    expect(await screen.findByText("Email verified successfully.")).toBeInTheDocument();
    expect(verifyEmailMock).toHaveBeenCalledWith({ email: "ada@example.com", code: "123456" });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(sessionStorage.getItem("user")).toBe(
      JSON.stringify({ email: "ada@example.com", name: "Ada Lovelace" }),
    );
    expect(routerPushMock).toHaveBeenCalledWith("/explore");
  });

  it("shows an error state for an invalid or expired code", async () => {
    const { ApiRequestError } = await import("@/lib/api-client");
    verifyEmailMock.mockRejectedValue(
      new ApiRequestError(
        "INVALID_OR_EXPIRED_CODE",
        "This verification code is invalid or has expired.",
        422,
      ),
    );
    searchParams = new URLSearchParams({ email: "ada@example.com" });

    render(<VerifyEmailPage />);
    enterCode("000000");
    clickVerify();

    expect(
      await screen.findByText(/this verification code is invalid or has expired/i),
    ).toBeInTheDocument();
  });

  it("resend clears the code field and calls resendVerificationEmail", async () => {
    resendVerificationEmailMock.mockResolvedValue({ message: "If an account exists..." });
    searchParams = new URLSearchParams({ email: "ada@example.com" });

    render(<VerifyEmailPage />);
    enterCode();

    fireEvent.click(screen.getByRole("button", { name: /resend code/i }));

    await waitFor(() =>
      expect(resendVerificationEmailMock).toHaveBeenCalledWith("ada@example.com"),
    );
    expect(screen.getByLabelText("Enter the 6-digit code")).toHaveValue("");
  });
});
