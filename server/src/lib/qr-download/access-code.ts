import { createHmac } from "node:crypto";

const WINDOW_MS = 60_000;

function codeForWindow(secret: string, windowIndex: number): string {
  const digest = createHmac("sha256", secret).update(String(windowIndex)).digest();
  // Use the first 4 bytes as an unsigned 32-bit int, then fold down to 6 digits — same
  // dynamic-truncation idea RFC 6238 (TOTP) uses, just without the counter/offset dance since
  // we don't need interop with an authenticator app, only an internal admin-panel display.
  const value = digest.readUInt32BE(0) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function getCurrentAccessCode(secret: string, atMs: number = Date.now()): { code: string; secondsRemaining: number } {
  const windowIndex = Math.floor(atMs / WINDOW_MS);
  const code = codeForWindow(secret, windowIndex);
  const secondsRemaining = 60 - Math.floor((atMs % WINDOW_MS) / 1000);
  return { code, secondsRemaining };
}

// Accepts the current window's code and the immediately preceding one, so a code shown right
// before it rotates still works for a few seconds after — without this, anyone who reads the
// code just as it changes would get a confusing rejection.
export function verifyAccessCode(secret: string, submitted: string, atMs: number = Date.now()): boolean {
  const normalized = submitted.trim();
  if (!/^\d{6}$/.test(normalized)) return false;

  const windowIndex = Math.floor(atMs / WINDOW_MS);
  return normalized === codeForWindow(secret, windowIndex) || normalized === codeForWindow(secret, windowIndex - 1);
}
