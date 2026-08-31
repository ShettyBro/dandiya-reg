import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { getRecentLogLines, logEvents } from "../../lib/log-stream.js";
import type { Env } from "../../app/config/env.js";

export function createAdminLogsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/logs/stream",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      for (const line of getRecentLogLines()) {
        res.write(`data: ${line}\n\n`);
      }

      const onLine = (line: string) => {
        res.write(`data: ${line}\n\n`);
      };
      logEvents.on("line", onLine);

      const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
      }, 25000);

      req.on("close", () => {
        clearInterval(heartbeat);
        logEvents.off("line", onLine);
      });
    }
  );

  return router;
}
