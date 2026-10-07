import { describe, expect, it } from "vitest";
import { getCurrentAccessCode, verifyAccessCode } from "../src/lib/qr-download/access-code.js";
import { verifyQrDownloadSessionToken, issueQrDownloadSessionToken } from "../src/lib/qr-download/session-token.js";

const SECRET = "d".repeat(32);

describe("qr-download access code", () => {
  it("is a 6-digit code", () => {
    const { code } = getCurrentAccessCode(SECRET, Date.now());
    expect(code).toMatch(/^\d{6}$/);
  });

  it("is deterministic within the same 60s window", () => {
    const base = Math.floor(Date.now() / 60000) * 60000;
    const a = getCurrentAccessCode(SECRET, base);
    const b = getCurrentAccessCode(SECRET, base + 30000);
    expect(a.code).toBe(b.code);
  });

  it("changes across windows", () => {
    const base = Math.floor(Date.now() / 60000) * 60000;
    const a = getCurrentAccessCode(SECRET, base);
    const b = getCurrentAccessCode(SECRET, base + 60000);
    expect(a.code).not.toBe(b.code);
  });

  it("differs for different secrets", () => {
    const now = Date.now();
    const a = getCurrentAccessCode("e".repeat(32), now);
    const b = getCurrentAccessCode("f".repeat(32), now);
    expect(a.code).not.toBe(b.code);
  });

  it("verifies the current window's code", () => {
    const now = Date.now();
    const { code } = getCurrentAccessCode(SECRET, now);
    expect(verifyAccessCode(SECRET, code, now)).toBe(true);
  });

  it("tolerates the immediately preceding window (rotation edge)", () => {
    const base = Math.floor(Date.now() / 60000) * 60000;
    const previous = getCurrentAccessCode(SECRET, base - 60000);
    // One millisecond after a new window starts, the previous window's code should still verify.
    expect(verifyAccessCode(SECRET, previous.code, base + 1)).toBe(true);
  });

  it("rejects a code from two windows ago", () => {
    const base = Math.floor(Date.now() / 60000) * 60000;
    const twoAgo = getCurrentAccessCode(SECRET, base - 120000);
    expect(verifyAccessCode(SECRET, twoAgo.code, base + 1)).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(verifyAccessCode(SECRET, "12345", Date.now())).toBe(false);
    expect(verifyAccessCode(SECRET, "abcdef", Date.now())).toBe(false);
    expect(verifyAccessCode(SECRET, "", Date.now())).toBe(false);
  });

  it("reports seconds remaining within the 1-60 range", () => {
    const { secondsRemaining } = getCurrentAccessCode(SECRET, Date.now());
    expect(secondsRemaining).toBeGreaterThanOrEqual(1);
    expect(secondsRemaining).toBeLessThanOrEqual(60);
  });
});

describe("qr-download session token", () => {
  it("issues a token that verifies successfully", () => {
    const token = issueQrDownloadSessionToken(SECRET);
    expect(verifyQrDownloadSessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = issueQrDownloadSessionToken(SECRET);
    expect(verifyQrDownloadSessionToken(token, "g".repeat(32))).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(verifyQrDownloadSessionToken("not-a-real-token", SECRET)).toBe(false);
  });
});
