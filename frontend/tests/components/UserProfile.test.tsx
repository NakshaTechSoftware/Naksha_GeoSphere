import { UserProfile } from "@/components/explore/UserProfile";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /user profile menu/i }));
}

describe("UserProfile", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows the signed-in user from the session", () => {
    sessionStorage.setItem(
      "user",
      JSON.stringify({ email: "likith.r@nakshatech.com", name: "Likith R" }),
    );

    render(<UserProfile />);
    openMenu();

    expect(screen.getByText("Likith R")).toBeInTheDocument();
    expect(screen.getByText("likith.r@nakshatech.com")).toBeInTheDocument();
    // Avatar initials come from the name (shown on both the avatar button
    // and the dropdown header).
    expect(screen.getAllByText("LR")).toHaveLength(2);
  });

  it("falls back to a guest label without a session", () => {
    render(<UserProfile />);
    openMenu();

    expect(screen.getByText("Guest User")).toBeInTheDocument();
    expect(screen.getByText("guest@naksha.com")).toBeInTheDocument();
  });

  it("lets explicit props override the session", () => {
    sessionStorage.setItem(
      "user",
      JSON.stringify({ email: "likith.r@nakshatech.com", name: "Likith R" }),
    );

    render(<UserProfile userName="Ada Lovelace" userEmail="ada@example.com" />);
    openMenu();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("clears the session on sign out", () => {
    sessionStorage.setItem(
      "user",
      JSON.stringify({ email: "likith.r@nakshatech.com", name: "Likith R" }),
    );

    render(<UserProfile />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(sessionStorage.getItem("user")).toBeNull();
  });
});
