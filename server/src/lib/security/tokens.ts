import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

// The frontend has no silent-refresh-before-expiry loop -- it only reacts to a 401 by logging
// the user out, so this TTL alone is the effective session length someone experiences, not just
// a token-rotation interval. All panels (Admin/Finance/ID Verifier/Volunteer/Team Leader) use the
// same 45-minute session length.
export const ACCESS_TOKEN_TTL_SECONDS_LONG = 45 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function accessTokenTtlSecondsForRole(_role: UserRole): number {
  return ACCESS_TOKEN_TTL_SECONDS_LONG;
}

export function signAccessToken(payload: AccessTokenPayload, secret: string, ttlSeconds: number): string {
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  return jwt.verify(token, secret) as AccessTokenPayload;
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
