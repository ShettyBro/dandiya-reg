import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { loginRateLimiter } from "../../lib/security/rate-limit.js";
import {
  ACCESS_TOKEN_COOKIE,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies
} from "../../lib/security/cookies.js";
import {
  AccountDisabledError,
  authenticate,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  issueSession,
  revokeRefreshToken,
  rotateRefreshToken
} from "./auth.service.js";
import { recordAuditLog } from "../audit/audit.service.js";
import { requireAuth } from "./auth.middleware.js";
import { hashPassword, verifyPassword } from "../../lib/security/password.js";
import type { Env } from "../../app/config/env.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

export function createAuthRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post("/auth/login", loginRateLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid login payload", parsed.error.flatten());
      return;
    }

    try {
      const user = await authenticate(prisma, parsed.data.email, parsed.data.password);
      const session = await issueSession(prisma, env, user);
      setAuthCookies(res, env, session);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      await recordAuditLog(prisma, {
        actorUserId: user.id,
        action: "AUTH_LOGIN",
        entityType: "User",
        entityId: user.id,
        requestId: req.id !== undefined ? String(req.id) : null
      });

      const profile = await prisma.volunteerProfile.findUnique({ where: { userId: user.id } });

      res.status(200).json({
        role: user.role,
        email: user.email,
        mustChangePassword: profile?.mustChangePassword ?? false
      });
    } catch (error) {
      if (error instanceof AccountDisabledError) {
        sendError(req, res, 403, "ACCOUNT_DISABLED", "This account has been disabled");
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        sendError(req, res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
        return;
      }
      throw error;
    }
  });

  router.post("/auth/logout", requireAuth(env), async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    if (refreshToken) {
      await revokeRefreshToken(prisma, refreshToken);
    }

    await recordAuditLog(prisma, {
      actorUserId: req.authUser?.id ?? null,
      action: "AUTH_LOGOUT",
      entityType: "User",
      entityId: req.authUser?.id ?? "unknown",
      requestId: req.id !== undefined ? String(req.id) : null
    });

    clearAuthCookies(res, env);
    res.status(204).send();
  });

  router.post("/auth/refresh", loginRateLimiter, async (req, res) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!refreshToken) {
      sendError(req, res, 401, "UNAUTHENTICATED", "Missing refresh token");
      return;
    }

    try {
      const session = await rotateRefreshToken(prisma, env, refreshToken);
      setAuthCookies(res, env, session);
      res.status(200).json({ role: session.user.role, email: session.user.email });
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        clearAuthCookies(res, env);
        sendError(req, res, 401, "UNAUTHENTICATED", "Invalid or expired refresh token");
        return;
      }
      throw error;
    }
  });

  router.get("/auth/me", requireAuth(env), async (req, res) => {
    if (!req.authUser) {
      sendError(req, res, 401, "UNAUTHENTICATED", "Missing authenticated user");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.authUser.id },
      include: { volunteerProfile: true }
    });

    res.status(200).json({
      userId: req.authUser.id,
      role: req.authUser.role,
      email: user?.email,
      status: user?.status,
      mustChangePassword: user?.volunteerProfile?.mustChangePassword ?? false,
      profile: user?.volunteerProfile
        ? {
            name: user.volunteerProfile.name,
            phone: user.volunteerProfile.phone,
            gate: user.volunteerProfile.gate,
            zone: user.volunteerProfile.zone,
            shiftStart: user.volunteerProfile.shiftStart,
            shiftEnd: user.volunteerProfile.shiftEnd
          }
        : null
    });
  });

  router.post("/auth/change-password", requireAuth(env), async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success || !req.authUser) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid change-password payload", parsed.error?.flatten());
      return;
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.authUser.id } });
    const currentValid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
    if (!currentValid) {
      sendError(req, res, 401, "INVALID_CREDENTIALS", "Current password is incorrect");
      return;
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      await tx.volunteerProfile.updateMany({
        where: { userId: user.id },
        data: { mustChangePassword: false }
      });
    });

    await recordAuditLog(prisma, {
      actorUserId: user.id,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      requestId: req.id !== undefined ? String(req.id) : null
    });

    res.status(200).json({ changed: true });
  });

  return router;
}

export { ACCESS_TOKEN_COOKIE };
