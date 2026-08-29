import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function signAccessToken(payload: AccessTokenPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
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
