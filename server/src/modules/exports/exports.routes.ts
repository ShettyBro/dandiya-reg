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
            registrationType: r.registrationType,
            name: r.name,
            email: r.email,
            phone: r.phone,
            institution: r.institution ?? "",
            auid: r.auid ?? "",
            year: r.year ?? "",
            employeeId: r.employeeId ?? "",
            collegeName: r.collegeName ?? "",
            identityDocumentType: r.identityDocumentType ?? "",
            identityStatus: r.identityStatus ?? "",
            status: r.status,
            paymentStatus: r.payment?.status ?? "",
            collegeGateState: r.attendance?.collegeGateState ?? "",
            eventGateState: r.attendance?.eventGateState ?? "",
            createdAt: r.createdAt
          })),
          [
            "registrationId",
            "publicCode",
            "eightDigitCode",
            "registrationType",
            "name",
            "email",
            "phone",
            "institution",
            "auid",
            "year",
            "employeeId",
            "collegeName",
            "identityDocumentType",
            "identityStatus",
            "status",
            "paymentStatus",
            "collegeGateState",
            "eventGateState",
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
            collegeGateState: a.collegeGateState,
            collegeGateEntryCount: a.collegeGateEntryCount,
            collegeGateFirstEntryAt: a.collegeGateFirstEntryAt,
            collegeGateLastEntryAt: a.collegeGateLastEntryAt,
            eventGateState: a.eventGateState,
            eventGateEntryCount: a.eventGateEntryCount,
            eventGateFirstEntryAt: a.eventGateFirstEntryAt,
            eventGateLastEntryAt: a.eventGateLastEntryAt
          })),
          [
            "registrationId",
            "publicCode",
            "name",
            "collegeGateState",
            "collegeGateEntryCount",
            "collegeGateFirstEntryAt",
            "collegeGateLastEntryAt",
            "eventGateState",
            "eventGateEntryCount",
            "eventGateFirstEntryAt",
            "eventGateLastEntryAt"
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
