import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "../src/lib/email/html-to-text.js";
import { renderEmailTemplate, type EmailAssets } from "../src/modules/email/templates.js";

describe("htmlToPlainText", () => {
  it("strips tags and keeps the text content", () => {
    const text = htmlToPlainText('<p style="color:red">Hi <strong>Asha</strong>, you are confirmed.</p>');
    expect(text).toBe("Hi Asha, you are confirmed.");
  });

  it("turns block-level boundaries into line breaks", () => {
    const text = htmlToPlainText("<div><p>Line one</p><p>Line two</p></div>");
    expect(text.split("\n").map((l) => l.trim())).toEqual(["Line one", "Line two"]);
  });

  it("decodes the entities the templates actually use", () => {
    const text = htmlToPlainText("Price &mdash; &#8377;151 &amp; up");
    expect(text).toBe("Price — ₹151 & up");
  });

  it("drops style/script blocks entirely rather than leaking their content", () => {
    const text = htmlToPlainText("<style>.x{color:red}</style><p>Visible</p><script>evil()</script>");
    expect(text).toBe("Visible");
  });

  it("produces non-empty, tag-free plain text for every real email template", () => {
    const assets: EmailAssets = {
      logoUrl: "https://example.test/logo.png",
      dancersUrl: "https://example.test/dancers.png",
      qrImageUrl: "https://example.test/qr.png"
    };
    const types = [
      "REGISTRATION_RECEIVED",
      "PAYMENT_APPROVED",
      "PAYMENT_REJECTED",
      "IDENTITY_REJECTED",
      "VOLUNTEER_INVITE",
      "PASSWORD_RESET"
    ] as const;

    for (const type of types) {
      const { html } = renderEmailTemplate(type, { name: "Asha", publicCode: "DN26-ABC123" }, assets);
      const text = htmlToPlainText(html);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/<[^>]+>/);
      // Regression guard for the &middot; class of bug: a template adding a new HTML entity this
      // converter doesn't know about must fail loudly here, not leak "&foo;" into real emails.
      expect(text, `leftover unhandled entity in ${type}`).not.toMatch(/&[a-zA-Z#][a-zA-Z0-9]*;/);
    }
  });
});
