import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("StatusIndicator", () => {
  it("shows the default label for the operational state", () => {
    render(<StatusIndicator state="operational" />);
    expect(screen.getByText("Operational")).toBeInTheDocument();
  });

  it("shows a custom label when provided", () => {
    render(<StatusIndicator state="unavailable" label="Offline" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });
});
