import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DetailsAndUploadStep } from "../routes/register/DetailsAndUploadStep.js";

function selectCustomOption(triggerLabel: RegExp, optionName: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name: triggerLabel }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

// ACHARYA_FACULTY needs no photo/identity upload, so these tests can exercise field validation
// and submission without also having to drive the canvas-based photo-cropping pipeline.
describe("DetailsAndUploadStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a live error for a non-acharya.ac.in email once the field is blurred, and never calls the API", async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <DetailsAndUploadStep
        registrationType="ACHARYA_FACULTY"
        idempotencyKey="test-key"
        onBack={onBack}
        onComplete={onComplete}
      />
    );

    const emailInput = screen.getByLabelText(/acharya email/i);
    fireEvent.change(emailInput, { target: { value: "test@gmail.com" } });
    fireEvent.blur(emailInput);

    expect(await screen.findByText(/must be a valid @acharya\.ac\.in/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("submits a valid Acharya Faculty payload and surfaces a backend validation error", async () => {
    const onComplete = vi.fn();
    const onBack = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "VALIDATION_ERROR", message: "Invalid registration payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );

    render(
      <DetailsAndUploadStep
        registrationType="ACHARYA_FACULTY"
        idempotencyKey="test-key"
        onBack={onBack}
        onComplete={onComplete}
      />
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/acharya email/i), { target: { value: "test@acharya.ac.in" } });
    fireEvent.change(screen.getByLabelText(/employee id/i), { target: { value: "emp123" } });
    selectCustomOption(/institution/i, /^Acharya Institute of Technology$/);

    fireEvent.click(screen.getByRole("button", { name: /pay now/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(await screen.findByText(/check the highlighted fields/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows a live error for an invalid phone number once the field is blurred", () => {
    render(
      <DetailsAndUploadStep
        registrationType="ACHARYA_FACULTY"
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

  it("keeps the Pay now button disabled until every required field is filled", () => {
    render(
      <DetailsAndUploadStep
        registrationType="ACHARYA_FACULTY"
        idempotencyKey="test-key"
        onBack={() => undefined}
        onComplete={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: /pay now/i })).toBeDisabled();
  });
});
