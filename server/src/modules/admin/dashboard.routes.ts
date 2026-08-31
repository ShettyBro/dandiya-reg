import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import type { Env } from "../../app/config/env.js";

export function createDashboardRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/dashboard",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (_req, res) => {
      const [
        totalRegistrations,
        paymentPending,
        paymentSubmitted,
        approved,
        rejected,
        collectionAgg,
        entered,
        overrideCount,
        event
      ] = await Promise.all([
        prisma.registration.count(),
        prisma.payment.count({ where: { status: "PENDING" } }),
        prisma.payment.count({ where: { status: "PROOF_SUBMITTED" } }),
        prisma.payment.count({ where: { status: "APPROVED" } }),
        prisma.payment.count({ where: { status: "REJECTED" } }),
        prisma.payment.aggregate({ where: { status: "APPROVED" }, _sum: { amountInPaise: true } }),
        prisma.attendance.count({ where: { state: { in: ["ENTERED", "OVERRIDE_ENTRY"] } } }),
        prisma.attendanceOverride.count(),
        prisma.event.findUnique({ where: { id: env.EVENT_ID } })
      ]);

      res.status(200).json({
        totalRegistrations,
        paymentPending,
        paymentSubmitted,
        approved,
        rejected,
        totalCollectionInPaise: collectionAgg._sum.amountInPaise ?? 0,
        entered,
        remainingCapacity: event ? Math.max(event.capacity - totalRegistrations, 0) : null,
        overrideCount,
        registrationOpen: event?.registrationOpen ?? null,
        maintenanceMode: event?.maintenanceMode ?? null
      });
    }
  );

  return router;
}
