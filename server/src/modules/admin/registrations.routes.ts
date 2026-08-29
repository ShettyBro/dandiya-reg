import { Router } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
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
          include: { payment: true, attendance: true }
        }),
        prisma.registration.count({ where })
      ]);

      res.status(200).json({ items, total, page, pageSize });
    }
  );

  return router;
}
