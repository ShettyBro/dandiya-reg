import { Router } from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import type { Env } from "../../app/config/env.js";

const jobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50)
});

export function createAdminSystemRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/email-jobs",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = jobsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
        return;
      }

      const [statusCounts, items, total] = await Promise.all([
        prisma.emailJob.groupBy({ by: ["status"], _count: true }),
        prisma.emailJob.findMany({
          orderBy: { createdAt: "desc" },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
          select: {
            id: true,
            type: true,
            recipient: true,
            status: true,
            attempts: true,
            nextAttemptAt: true,
            lockedUntil: true,
            sentAt: true,
            lastError: true,
            createdAt: true
          }
        }),
        prisma.emailJob.count()
      ]);

      const counts: Record<string, number> = {
        PENDING: 0,
        PROCESSING: 0,
        RETRY: 0,
        SENT: 0,
        FAILED: 0
      };
      for (const row of statusCounts) {
        counts[row.status] = row._count;
      }

      res.status(200).json({ counts, items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
    }
  );

  router.get(
    "/admin/system-stats",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (_req, res) => {
      let disk: { totalBytes: number; freeBytes: number; usedBytes: number } | null = null;
      try {
        const stats = await fs.statfs("/");
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bavail * stats.bsize;
        disk = { totalBytes, freeBytes, usedBytes: totalBytes - freeBytes };
      } catch {
        disk = null;
      }

      res.status(200).json({
        uptimeSeconds: Math.floor(process.uptime()),
        hostUptimeSeconds: Math.floor(os.uptime()),
        loadAverage: os.loadavg(),
        cpuCount: os.cpus().length,
        memory: {
          totalBytes: os.totalmem(),
          freeBytes: os.freemem()
        },
        disk,
        nodeVersion: process.version,
        env: env.NODE_ENV
      });
    }
  );

  return router;
}
