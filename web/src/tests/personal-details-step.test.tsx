import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PersonalDetailsStep } from "../routes/register/PersonalDetailsStep.js";

describe("PersonalDetailsStep", () => {
  it("blocks submission for a non-acharya.ac.in email before calling the API", async () => {
    const onComplete = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<PersonalDetailsStep idempotencyKey="test-key" onComplete={onComplete} />);

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "9876543210" } });
    fireEvent.change(screen.getByLabelText(/college email/i), { target: { value: "test@gmail.com" } });
    fireEvent.change(screen.getByLabelText(/^college$/i), { target: { value: "Acharya" } });
    fireEvent.change(screen.getByLabelText(/semester/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/branch/i), { target: { value: "CSE" } });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText(/only @acharya\.ac\.in/i)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
