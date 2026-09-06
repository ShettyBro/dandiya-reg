import { describe, expect, it } from "vitest";
import { renderEmailTemplate, type EmailAssets } from "../src/modules/email/templates.js";

const assets: EmailAssets = {
  logoUrl: "https://example.test/acharya-logo.png",
  dancersUrl: "https://example.test/dandiya-dancers.png"
};

describe("renderEmailTemplate", () => {
  it("renders PAYMENT_APPROVED with the participant name and code", () => {
    const result = renderEmailTemplate("PAYMENT_APPROVED", { name: "Asha", publicCode: "DN26-ABC123" }, assets);
    expect(result.subject).toContain("pass is ready");
    expect(result.html).toContain("Asha");
    expect(result.html).toContain("DN26-ABC123");
  });

  it("renders PAYMENT_APPROVED with an inline QR image when provided", () => {
    const result = renderEmailTemplate(
      "PAYMENT_APPROVED",
      { name: "Asha", publicCode: "DN26-ABC123" },
      { ...assets, qrImageDataUrl: "data:image/png;base64,AAAA" }
    );
    expect(result.html).toContain("data:image/png;base64,AAAA");
  });

  it("renders PAYMENT_REJECTED with a generic message, no specific reason text", () => {
    const result = renderEmailTemplate(
      "PAYMENT_REJECTED",
      { name: "Ravi", publicCode: "DN26-XYZ999", reason: "Screenshot unreadable" },
      assets
    );
    expect(result.html).toContain("unable to verify your payment");
    expect(result.html).not.toContain("Screenshot unreadable");
  });

  it("renders IDENTITY_REJECTED with a generic message and no-payment instruction, no specific reason text", () => {
    const result = renderEmailTemplate(
      "IDENTITY_REJECTED",
      { name: "Priya", publicCode: "DN26-NAC001", reason: "Aadhaar image unreadable" },
      assets
    );
    expect(result.html).toContain("unable to verify your identity");
    expect(result.html).not.toContain("Aadhaar image unreadable");
    expect(result.html).toContain("do not make another payment");
  });

  it("falls back gracefully when payload fields are missing", () => {
    const result = renderEmailTemplate("REGISTRATION_RECEIVED", {}, assets);
    expect(result.subject).toBeTruthy();
    expect(result.html).toContain("Participant");
  });
});
