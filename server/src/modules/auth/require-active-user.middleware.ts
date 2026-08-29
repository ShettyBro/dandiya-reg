import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";

export function requireActiveUser(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.authUser) {
      sendError(req, res, 401, "UNAUTHENTICATED", "Missing authenticated user");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.authUser.id } });
    if (!user || user.status !== "ACTIVE") {
      sendError(req, res, 403, "ACCOUNT_DISABLED", "This account has been disabled");
      return;
    }

    next();
  };
}
