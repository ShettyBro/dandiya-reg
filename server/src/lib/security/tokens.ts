import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

// Since the move to Bearer-token auth, apiRequest transparently refreshes an expired access
// token in the background using the (30-day) refresh token -- this TTL is now just an internal
// rotation interval, not the session length someone actually experiences. All panels use 45
// minutes except Help Desk, which runs longer (3h) shifts at the event and asked for a longer one.
export const ACCESS_TOKEN_TTL_SECONDS_LONG = 45 * 60;
export const ACCESS_TOKEN_TTL_SECONDS_HELP_DESK = 3 * 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function accessTokenTtlSecondsForRole(role: UserRole): number {
  return role === "HELP_DESK" ? ACCESS_TOKEN_TTL_SECONDS_HELP_DESK : ACCESS_TOKEN_TTL_SECONDS_LONG;
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
