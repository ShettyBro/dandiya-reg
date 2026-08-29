import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { toCsv } from "../../lib/security/csv.js";
import type { Env } from "../../app/config/env.js";

const EXPORT_TYPES = ["registrations", "payments", "attendance"] as const;

export function createExportsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/exports/:type",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const type = stringParam(req.params.type);
      if (!type || !(EXPORT_TYPES as readonly string[]).includes(type)) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Unsupported export type");
        return;
      }

      let csv: string;
      let filename: string;

      if (type === "registrations") {
        const rows = await prisma.registration.findMany({
          orderBy: { createdAt: "asc" },
          include: { payment: true, attendance: true }
        });
        csv = toCsv(
          rows.map((r) => ({
            registrationId: r.id,
            publicCode: r.publicCode,
            eightDigitCode: r.eightDigitCode,
            name: r.name,
            email: r.email,
            phone: r.phone,
            college: r.college,
            semester: r.semester,
            branch: r.branch,
            status: r.status,
            paymentStatus: r.payment?.status ?? "",
            attendanceState: r.attendance?.state ?? "",
            createdAt: r.createdAt
          })),
          [
            "registrationId",
            "publicCode",
            "eightDigitCode",
            "name",
            "email",
            "phone",
            "college",
            "semester",
            "branch",
            "status",
            "paymentStatus",
            "attendanceState",
            "createdAt"
          ]
        );
        filename = "registrations.csv";
      } else if (type === "payments") {
        const rows = await prisma.payment.findMany({
          orderBy: { createdAt: "asc" },
          include: { registration: { select: { publicCode: true, name: true, email: true } } }
        });
        csv = toCsv(
          rows.map((p) => ({
            paymentId: p.id,
            publicCode: p.registration.publicCode,
            name: p.registration.name,
            email: p.registration.email,
            transactionId: p.transactionId,
            amountInPaise: p.amountInPaise,
            status: p.status,
            submittedAt: p.submittedAt,
            verifiedAt: p.verifiedAt,
            rejectionReason: p.rejectionReason
          })),
          [
            "paymentId",
            "publicCode",
            "name",
            "email",
            "transactionId",
            "amountInPaise",
            "status",
            "submittedAt",
            "verifiedAt",
            "rejectionReason"
          ]
        );
        filename = "payments.csv";
      } else {
        const rows = await prisma.attendance.findMany({
          orderBy: { updatedAt: "asc" },
          include: { registration: { select: { publicCode: true, name: true } } }
        });
        csv = toCsv(
          rows.map((a) => ({
            registrationId: a.registrationId,
            publicCode: a.registration.publicCode,
            name: a.registration.name,
            state: a.state,
            entryCount: a.entryCount,
            firstEntryAt: a.firstEntryAt,
            lastEntryAt: a.lastEntryAt,
            lastGate: a.lastGate
          })),
          [
            "registrationId",
            "publicCode",
            "name",
            "state",
            "entryCount",
            "firstEntryAt",
            "lastEntryAt",
            "lastGate"
          ]
        );
        filename = "attendance.csv";
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    }
  );

  return router;
}
