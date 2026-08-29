import { createHash, createHmac, randomUUID } from "node:crypto";

export function newCredentialId(): string {
  return randomUUID();
}

export function deriveSignedCredentialToken(qrSecret: string, credentialId: string): string {
  return createHmac("sha256", qrSecret).update(credentialId).digest("base64url");
}

export function hashCredentialToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
