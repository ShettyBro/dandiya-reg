import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { getRecentLogLines, logEvents } from "../../lib/log-stream.js";
import type { Env } from "../../app/config/env.js";

const WORKER_LOG_POLL_MS = 3000;
const WORKER_LOG_INITIAL_COUNT = 200;

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

  // The worker runs as its own separate process -- there's no in-memory event to subscribe to
  // here, so this polls the shared WorkerLogEntry table instead and pushes any new rows as SSE,
  // giving the same "live" UX as the server log stream above without a true cross-process push.
  router.get(
    "/admin/worker-logs/stream",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const initial = await prisma.workerLogEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: WORKER_LOG_INITIAL_COUNT
      });
      let lastCreatedAt = initial[0]?.createdAt ?? new Date(0);
      for (const entry of initial.reverse()) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }

      const poll = setInterval(async () => {
        try {
          const fresh = await prisma.workerLogEntry.findMany({
            where: { createdAt: { gt: lastCreatedAt } },
            orderBy: { createdAt: "asc" },
            take: 100
          });
          for (const entry of fresh) {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
            lastCreatedAt = entry.createdAt;
          }
        } catch {
          // A transient DB hiccup here shouldn't kill the SSE connection -- just skip this tick.
        }
      }, WORKER_LOG_POLL_MS);

      const heartbeat = setInterval(() => {
        res.write(": ping\n\n");
      }, 25000);

      req.on("close", () => {
        clearInterval(poll);
        clearInterval(heartbeat);
      });
    }
  );

  return router;
}
