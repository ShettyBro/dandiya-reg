import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Env } from "../../app/config/env.js";

const settingsSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    venue: z.string().trim().min(1).max(300),
    eventDate: z.coerce.date(),
    registrationOpen: z.boolean(),
    registrationDeadline: z.coerce.date().nullable(),
    capacity: z.number().int().positive(),
    priceInPaise: z.number().int().nonnegative(),
    erpPaymentUrl: z.string().url(),
    paymentInstructions: z.string().trim().min(1).max(2000),
    attendanceEnabled: z.boolean(),
    paymentsEnabled: z.boolean(),
    maintenanceMode: z.boolean()
  })
  .partial();

export function createAdminSettingsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/settings",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (_req, res) => {
      const event = await prisma.event.findUniqueOrThrow({ where: { id: env.EVENT_ID } });
      res.status(200).json(event);
    }
  );

  router.post(
    "/admin/settings",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid settings payload", parsed.error.flatten());
        return;
      }
      if (!req.authUser) {
        sendError(req, res, 401, "UNAUTHENTICATED", "Missing authenticated user");
        return;
      }

      const updateData = Object.fromEntries(
        Object.entries(parsed.data).filter(([, value]) => value !== undefined)
      );

      const updated = await prisma.event.update({
        where: { id: env.EVENT_ID },
        data: updateData
      });

      await recordAuditLog(prisma, {
        actorUserId: req.authUser.id,
        action: "EVENT_SETTINGS_UPDATED",
        entityType: "Event",
        entityId: updated.id,
        metadata: parsed.data,
        requestId: req.id !== undefined ? String(req.id) : null
      });

      res.status(200).json(updated);
    }
  );

  return router;
}
