import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { LandingPage } from "../routes/landing-page.js";

describe("LandingPage", () => {
  it("renders the hero heading, a disabled closed-registration CTA, and the status link", () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dandiya Night 2026");
    // Registration is permanently closed on the public site -- the CTA renders as a disabled,
    // non-navigable span (no link role, no href to /reg) rather than an actual link.
    expect(screen.getAllByText(/registration closed/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("link", { name: /join the celebration/i })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /check status/i }).length).toBeGreaterThan(0);
  });

  it("renders the highlights and rules sections", () => {
    render(
      <BrowserRouter>
        <LandingPage />
      </BrowserRouter>
    );

    expect(screen.getByText("The essentials")).toBeTruthy();
    expect(screen.getByText("Event do's & don'ts")).toBeTruthy();
  });
});
