import { describe, expect, it } from "vitest";
import { renderEmailTemplate, type EmailAssets } from "../src/modules/email/templates.js";

const assets: EmailAssets = {
  logoUrl: "https://example.test/acharya-logo.png",
  dancersUrl: "https://example.test/dandiya-dancers.png"
};

describe("renderEmailTemplate", () => {
  it("renders PAYMENT_APPROVED with the participant name and code", () => {
    const result = renderEmailTemplate("PAYMENT_APPROVED", { name: "Asha", publicCode: "DN26-ABC123" }, assets);
    expect(result.subject).toContain("Dandiya Celebration Kit");
    expect(result.html).toContain("Asha");
    expect(result.html).toContain("DN26-ABC123");
  });

  it("renders PAYMENT_APPROVED with the QR image as a plain externally-hosted URL, not a data: URI", () => {
    const result = renderEmailTemplate(
      "PAYMENT_APPROVED",
      { name: "Asha", publicCode: "DN26-ABC123" },
      { ...assets, qrImageUrl: "https://dandiya-api.example.test/api/v1/pass/credential/abc-123/qr.png" }
    );
    expect(result.html).toContain("https://dandiya-api.example.test/api/v1/pass/credential/abc-123/qr.png");
    expect(result.html).not.toContain("data:image");
  });

  it("renders PAYMENT_REJECTED with a generic message, no specific reason text", () => {
    const result = renderEmailTemplate(
      "PAYMENT_REJECTED",
      { name: "Ravi", publicCode: "DN26-XYZ999", reason: "Screenshot unreadable" },
      assets
    );
    expect(result.html).toContain("unable to verify your Dandiya Celebration Kit payment");
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
