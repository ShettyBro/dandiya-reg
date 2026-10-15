import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";
import { verifyAccessToken } from "../../lib/security/tokens.js";
import type { Env } from "../../app/config/env.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: { id: string; role: UserRole };
    }
  }
}

const BEARER_PREFIX = "Bearer ";

// Bearer-token auth, not cookies -- iOS Safari (and every iOS browser, which all share WebKit)
// blocks third-party cookies by default, and this app's frontend and API live on unrelated
// domains (different eTLD+1), so cookie-based auth was silently failing on every iOS device
// regardless of browser. An Authorization header isn't subject to that restriction at all, and
// isn't automatically attached by the browser to other sites' requests either, so the CSRF
// double-submit check this used to need is no longer meaningful and has been removed entirely.
export function requireAuth(env: Env) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    const token = header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : undefined;

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
