import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { recordAuditLog } from "../audit/audit.service.js";
import {
  deleteRegistrationAndAssets,
  RegistrationNotFoundError
} from "../registration/registration-cleanup.service.js";
import type { Env } from "../../app/config/env.js";

const filterSchema = z.object({
  search: z.string().trim().max(200).optional(),
  filter: z
    .enum(["all", "payment_pending", "proof_submitted", "approved", "rejected", "entered", "not_entered"])
    .default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

export function createAdminRegistrationsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/registrations",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = filterSchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
        return;
      }

      const { search, filter, page, pageSize } = parsed.data;
      const where: Prisma.RegistrationWhereInput = {};

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { publicCode: { contains: search, mode: "insensitive" } },
          { eightDigitCode: { contains: search } },
          { payment: { transactionId: { contains: search, mode: "insensitive" } } }
        ];
      }

      if (filter === "payment_pending") where.payment = { status: "PENDING" };
      if (filter === "proof_submitted") where.payment = { status: "PROOF_SUBMITTED" };
      if (filter === "approved") where.payment = { status: "APPROVED" };
      if (filter === "rejected") where.payment = { status: "REJECTED" };
      if (filter === "entered") where.attendance = { state: { in: ["ENTERED", "OVERRIDE_ENTRY"] } };
      if (filter === "not_entered") where.attendance = { state: "NOT_ENTERED" };

      const [items, total] = await Promise.all([
        prisma.registration.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            registrationType: true,
            publicCode: true,
            eightDigitCode: true,
            name: true,
            email: true,
            phone: true,
            institution: true,
            collegeName: true,
            status: true,
            identityStatus: true,
            createdAt: true,
            payment: { select: { status: true, amountInPaise: true, transactionId: true } },
            attendance: { select: { state: true } }
          }
        }),
        prisma.registration.count({ where })
      ]);

      res.status(200).json({ items, total, page, pageSize });
    }
  );

  router.delete(
    "/admin/registrations/:id",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const registrationId = stringParam(req.params.id);
      if (!registrationId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
        return;
      }

      try {
        const deleted = await deleteRegistrationAndAssets(prisma, env, registrationId);
        await recordAuditLog(prisma, {
          actorUserId: req.authUser.id,
          action: "REGISTRATION_DELETED",
          entityType: "Registration",
          entityId: registrationId,
          metadata: deleted,
          requestId: req.id !== undefined ? String(req.id) : null
        });
        res.status(204).send();
      } catch (error) {
        if (error instanceof RegistrationNotFoundError) {
          sendError(req, res, 404, "NOT_FOUND", "Registration not found");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
