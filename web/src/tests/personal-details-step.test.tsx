import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonalDetailsStep } from "../routes/register/PersonalDetailsStep.js";

function selectCustomOption(triggerLabel: RegExp, optionName: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: triggerLabel }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("PersonalDetailsStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks submission client-side for a non-acharya.ac.in email and never calls the API", async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

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
    selectCustomOption(/institution/i, /^Acharya Institute of Technology$/);
    selectCustomOption(/^year$/i, /^Year 2$/);

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/must be a valid @acharya\.ac\.in/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("submits a valid Acharya Student payload and surfaces a backend validation error", async () => {
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
    fireEvent.change(screen.getByLabelText(/acharya email/i), { target: { value: "test@acharya.ac.in" } });
    fireEvent.change(screen.getByLabelText(/auid/i), { target: { value: "auid123" } });
    selectCustomOption(/institution/i, /^Acharya Institute of Technology$/);
    selectCustomOption(/^year$/i, /^Year 2$/);

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(await screen.findByText(/check the highlighted fields/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows a live error for an invalid phone number once the field is blurred", () => {
    render(
      <PersonalDetailsStep
        registrationType="ACHARYA_STUDENT"
        idempotencyKey="test-key"
        onBack={() => undefined}
        onComplete={() => undefined}
      />
    );

    const phoneInput = screen.getByLabelText(/phone number/i);
    fireEvent.change(phoneInput, { target: { value: "12345" } });
    fireEvent.blur(phoneInput);

    expect(screen.getByText(/valid 10-digit mobile number/i)).toBeTruthy();
  });
});
