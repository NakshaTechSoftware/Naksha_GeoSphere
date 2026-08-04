import { SignupForm } from "@/components/auth/SignupForm";
import { ApiRequestError, ApiUnavailableError } from "@/lib/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const registerAccountMock = vi.fn();

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    registerAccount: (...args: Parameters<typeof actual.registerAccount>) =>
      registerAccountMock(...args),
  };
});

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText("Organization / Company"), {
    target: { value: "Example Org" },
  });
  fireEvent.change(screen.getByLabelText("Role or Use Case"), { target: { value: "developer" } });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a-strong-password-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: "a-strong-password-123" },
  });
  fireEvent.click(screen.getByLabelText(/I agree to the/));
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("SignupForm", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows field errors and does not submit when required fields are empty", () => {
    render(<SignupForm />);

    submit();

    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email address", () => {
    render(<SignupForm />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Work Email"), { target: { value: "not-an-email" } });

    submit();

    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", () => {
    render(<SignupForm />);
    fillValidForm();
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "a-different-password-1" },
    });

    submit();

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("requires the terms checkbox to be checked", () => {
    render(<SignupForm />);
    fillValidForm();
    fireEvent.click(screen.getByLabelText(/I agree to the/)); // uncheck

    submit();

    expect(
      screen.getByText("You must accept the Terms of Service and Privacy Policy."),
    ).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it("shows a submitting state and disables the button while the request is in flight", async () => {
    let resolveRequest: (() => void) | undefined;
    registerAccountMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = () =>
          resolve({
            user: {
              id: "1",
              fullName: "Ada Lovelace",
              email: "ada@example.com",
              organizationName: "Example Org",
              roleOrUseCase: "developer",
              status: "pending_verification",
              createdAt: "2026-08-04T00:00:00Z",
            },
            nextStep: "verify_email",
            message: "Account created.",
          });
      }),
    );

    render(<SignupForm />);
    fillValidForm();
    submit();

    const button = await screen.findByRole("button", { name: /creating account/i });
    expect(button).toBeDisabled();

    resolveRequest?.();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it("only sends one request when the button is double-clicked", async () => {
    registerAccountMock.mockResolvedValue({
      user: {
        id: "1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: "Example Org",
        roleOrUseCase: "developer",
        status: "pending_verification",
        createdAt: "2026-08-04T00:00:00Z",
      },
      nextStep: "verify_email",
      message: "Account created.",
    });

    render(<SignupForm />);
    fillValidForm();
    // Click the same button element twice in immediate succession — the
    // scenario the submittingRef guard exists for (the label/disabled
    // attribute hasn't updated yet on the first synchronous click).
    const button = screen.getByRole("button", { name: /create account/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(registerAccountMock).toHaveBeenCalledTimes(1);
  });

  it("navigates to /verify-email with the email on success", async () => {
    registerAccountMock.mockResolvedValue({
      user: {
        id: "1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: "Example Org",
        roleOrUseCase: "developer",
        status: "pending_verification",
        createdAt: "2026-08-04T00:00:00Z",
      },
      nextStep: "verify_email",
      message: "Account created.",
    });

    render(<SignupForm />);
    fillValidForm();
    submit();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/verify-email?email=ada%40example.com"),
    );
  });

  it("shows a duplicate-email message and does not navigate", async () => {
    registerAccountMock.mockRejectedValue(
      new ApiRequestError(
        "EMAIL_ALREADY_REGISTERED",
        "An account already exists for this email.",
        409,
      ),
    );

    render(<SignupForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText(/an account already exists for this email/i)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("maps backend field validation errors onto the matching inputs", async () => {
    registerAccountMock.mockRejectedValue(
      new ApiRequestError("VALIDATION_ERROR", "One or more fields are invalid.", 422, {
        organization_name: "must not be blank",
      }),
    );

    render(<SignupForm />);
    fillValidForm();
    submit();

    expect(await screen.findByText("must not be blank")).toBeInTheDocument();
  });

  it("shows a retry message on a network failure and re-enables the button", async () => {
    registerAccountMock.mockRejectedValue(new ApiUnavailableError(new Error("network down")));

    render(<SignupForm />);
    fillValidForm();
    submit();

    expect(
      await screen.findByText(/couldn't reach the server/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account/i })).toBeEnabled();
  });

  it("never writes the password to localStorage or sessionStorage", async () => {
    registerAccountMock.mockResolvedValue({
      user: {
        id: "1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        organizationName: "Example Org",
        roleOrUseCase: "developer",
        status: "pending_verification",
        createdAt: "2026-08-04T00:00:00Z",
      },
      nextStep: "verify_email",
      message: "Account created.",
    });

    render(<SignupForm />);
    fillValidForm();
    submit();

    await waitFor(() => expect(pushMock).toHaveBeenCalled());

    const haystack = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
      JSON.stringify(localStorage),
      JSON.stringify(sessionStorage),
    ].join(" ");
    expect(haystack).not.toContain("a-strong-password-123");
  });
});
