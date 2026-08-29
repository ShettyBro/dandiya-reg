import type { PrismaClient, User } from "@prisma/client";
import { verifyPassword } from "../../lib/security/password.js";
import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  REFRESH_TOKEN_TTL_MS
} from "../../lib/security/tokens.js";
import type { Env } from "../../app/config/env.js";

export class InvalidCredentialsError extends Error {}
export class AccountDisabledError extends Error {}

export async function authenticate(
  prisma: PrismaClient,
  email: string,
  password: string
): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    throw new InvalidCredentialsError();
  }

  if (user.status !== "ACTIVE") {
    throw new AccountDisabledError();
  }

  return user;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export async function issueSession(
  prisma: PrismaClient,
  env: Env,
  user: User
): Promise<IssuedSession> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role }, env.SESSION_SECRET);
  const refreshToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    }
  });

  return { accessToken, refreshToken, csrfToken };
}

export async function revokeRefreshToken(prisma: PrismaClient, rawToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export class InvalidRefreshTokenError extends Error {}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  env: Env,
  rawToken: string
): Promise<IssuedSession & { user: User }> {
  const tokenHash = hashOpaqueToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !existing ||
    existing.revokedAt ||
    existing.expiresAt.getTime() < Date.now() ||
    existing.user.status !== "ACTIVE"
  ) {
    throw new InvalidRefreshTokenError();
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() }
  });

  const session = await issueSession(prisma, env, existing.user);
  return { ...session, user: existing.user };
}
