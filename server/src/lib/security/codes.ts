import { randomInt } from "node:crypto";

const UNAMBIGUOUS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePublicCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += UNAMBIGUOUS_ALPHABET[randomInt(UNAMBIGUOUS_ALPHABET.length)];
  }
  return `DN26-${suffix}`;
}

export function generateEightDigitCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}
