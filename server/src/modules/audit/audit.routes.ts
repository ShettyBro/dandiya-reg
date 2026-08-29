import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import type { Env } from "../../app/config/env.js";

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50)
});

export function createAuditLogRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/audit-logs",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
        return;
      }

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
          include: { actorUser: { select: { email: true, role: true } } }
        }),
        prisma.auditLog.count()
      ]);

      res.status(200).json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
    }
  );

  return router;
}
