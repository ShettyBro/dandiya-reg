import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";
import { verifyAccessToken } from "../../lib/security/tokens.js";
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  isCsrfSafeRequest
} from "../../lib/security/cookies.js";
import type { Env } from "../../app/config/env.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: { id: string; role: UserRole };
    }
  }
}

export function requireAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      sendError(req, res, 401, "UNAUTHENTICATED", "Missing access token");
      return;
    }

    try {
      const payload = verifyAccessToken(token, env.SESSION_SECRET);
      req.authUser = { id: payload.sub, role: payload.role };
    } catch {
      sendError(req, res, 401, "UNAUTHENTICATED", "Invalid or expired access token");
      return;
    }

    if (!isCsrfSafeRequest(req)) {
      const csrfCookie = req.cookies?.[CSRF_TOKEN_COOKIE] as string | undefined;
      const csrfHeader = req.header("x-csrf-token");

      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        sendError(req, res, 403, "CSRF_REJECTED", "Missing or invalid CSRF token");
        return;
      }
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      sendError(req, res, 403, "FORBIDDEN", "Insufficient role for this action");
      return;
    }
    next();
  };
}
