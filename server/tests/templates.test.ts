import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "../src/modules/email/templates.js";

describe("renderEmailTemplate", () => {
  it("renders PAYMENT_APPROVED with the participant name and code", () => {
    const result = renderEmailTemplate("PAYMENT_APPROVED", { name: "Asha", publicCode: "DN26-ABC123" });
    expect(result.subject).toContain("pass is ready");
    expect(result.html).toContain("Asha");
    expect(result.html).toContain("DN26-ABC123");
  });

  it("renders PAYMENT_REJECTED with the rejection reason", () => {
    const result = renderEmailTemplate("PAYMENT_REJECTED", {
      name: "Ravi",
      publicCode: "DN26-XYZ999",
      reason: "Screenshot unreadable"
    });
    expect(result.html).toContain("Screenshot unreadable");
  });

  it("falls back gracefully when payload fields are missing", () => {
    const result = renderEmailTemplate("REGISTRATION_RECEIVED", {});
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Participant");
  });
});
