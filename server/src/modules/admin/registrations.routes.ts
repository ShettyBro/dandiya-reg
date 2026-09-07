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
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import type { Env } from "../../app/config/env.js";

async function presignIfPresent(env: Env, objectKey: string | null): Promise<string | null> {
  if (!objectKey) return null;
  try {
    const client = getR2Client(env);
    return await presignGetUrl(client, env.R2_BUCKET_NAME, objectKey, env.R2_PRESIGN_READ_TTL);
  } catch (error) {
    if (error instanceof R2NotConfiguredError) return null;
    throw error;
  }
}

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

  router.get(
    "/admin/registrations/:id",
    requireAuth(env),
    requireRole("ADMIN"),
    requireActiveUser(prisma),
    async (req, res) => {
      const id = stringParam(req.params.id);
      const registration = id
        ? await prisma.registration.findUnique({
            where: { id },
            include: { payment: true, attendance: true }
          })
        : null;

      if (!registration) {
        sendError(req, res, 404, "NOT_FOUND", "Registration not found");
        return;
      }

      const [photoUrl, paymentProofUrl, aadhaarImageUrl, collegeIdImageUrl] = await Promise.all([
        presignIfPresent(env, registration.photoObjectKey),
        presignIfPresent(env, registration.payment?.proofObjectKey ?? null),
        presignIfPresent(env, registration.aadhaarImageObjectKey),
        presignIfPresent(env, registration.collegeIdImageObjectKey)
      ]);

      res.status(200).json({
        id: registration.id,
        registrationType: registration.registrationType,
        publicCode: registration.publicCode,
        eightDigitCode: registration.eightDigitCode,
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        institution: registration.institution,
        auid: registration.auid,
        year: registration.year,
        employeeId: registration.employeeId,
        collegeName: registration.collegeName,
        status: registration.status,
        identityStatus: registration.identityStatus,
        identityRejectionReason: registration.identityRejectionReason,
        createdAt: registration.createdAt,
        photoUrl,
        aadhaarImageUrl,
        collegeIdImageUrl,
        payment: registration.payment
          ? {
              status: registration.payment.status,
              amountInPaise: registration.payment.amountInPaise,
              transactionId: registration.payment.transactionId,
              rejectionReason: registration.payment.rejectionReason,
              submittedAt: registration.payment.submittedAt,
              proofUrl: paymentProofUrl
            }
          : null,
        attendance: registration.attendance ? { state: registration.attendance.state } : null
      });
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
