import { Button } from "@/components/ui/Button";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Explore Geospatial Data</Button>);
    expect(screen.getByRole("button", { name: "Explore Geospatial Data" })).toBeInTheDocument();
  });

  it("applies the disabled state", () => {
    render(<Button disabled>Explore Geospatial Data</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
