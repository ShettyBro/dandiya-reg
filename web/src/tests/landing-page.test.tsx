import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { LandingPage } from "../routes/landing-page.js";

describe("LandingPage", () => {
  it("renders the hero heading and both primary CTAs", () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dandiya Night 2026");
    expect(screen.getAllByRole("link", { name: /register now/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /check status/i }).length).toBeGreaterThan(0);
  });

  it("renders the highlights and rules sections", () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );

    expect(screen.getByText("The essentials")).toBeTruthy();
    expect(screen.getByText("Entry rules")).toBeTruthy();
  });
});
