import { describe, expect, it } from "vitest";
import {
  deriveSignedCredentialToken,
  hashCredentialToken,
  newCredentialId
} from "../src/lib/qr/credential.js";

describe("credential signing", () => {
  it("is deterministic for the same secret and id", () => {
    const id = newCredentialId();
    const a = deriveSignedCredentialToken("a".repeat(32), id);
    const b = deriveSignedCredentialToken("a".repeat(32), id);
    expect(a).toBe(b);
  });

  it("differs for different credential ids", () => {
    const secret = "a".repeat(32);
    const tokenA = deriveSignedCredentialToken(secret, newCredentialId());
    const tokenB = deriveSignedCredentialToken(secret, newCredentialId());
    expect(tokenA).not.toBe(tokenB);
  });

  it("differs for different secrets", () => {
    const id = newCredentialId();
    const tokenA = deriveSignedCredentialToken("a".repeat(32), id);
    const tokenB = deriveSignedCredentialToken("b".repeat(32), id);
    expect(tokenA).not.toBe(tokenB);
  });

  it("does not reveal the raw credential id in the token", () => {
    const id = newCredentialId();
    const token = deriveSignedCredentialToken("a".repeat(32), id);
    expect(token).not.toContain(id);
  });

  it("hashes consistently", () => {
    const token = "sample-token-value";
    expect(hashCredentialToken(token)).toBe(hashCredentialToken(token));
  });
});
