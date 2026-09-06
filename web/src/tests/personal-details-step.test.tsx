import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonalDetailsStep } from "../routes/register/PersonalDetailsStep.js";

describe("PersonalDetailsStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits an Acharya Student payload and surfaces a backend validation error", async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "VALIDATION_ERROR", message: "Invalid registration payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );

    render(
      <PersonalDetailsStep
        registrationType="ACHARYA_STUDENT"
        idempotencyKey="test-key"
        onBack={onBack}
        onComplete={onComplete}
      />
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/acharya email/i), { target: { value: "test@gmail.com" } });
    fireEvent.change(screen.getByLabelText(/auid/i), { target: { value: "auid123" } });
    fireEvent.change(screen.getByLabelText(/institution/i), {
      target: { value: "Acharya Institute of Technology" }
    });
    fireEvent.change(screen.getByLabelText(/^year$/i), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(await screen.findByText(/check the highlighted fields/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
