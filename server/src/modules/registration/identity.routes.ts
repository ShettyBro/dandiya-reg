import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import { approveIdentity, IdentityNotReviewableError, rejectIdentity } from "./identity.service.js";
import type { Env } from "../../app/config/env.js";

const listQuerySchema = z.object({
  status: z.enum(["IDENTITY_PENDING", "IDENTITY_REJECTED", "PAYMENT_SUBMITTED", "PAYMENT_APPROVED", "PAYMENT_REJECTED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

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

export function createIdentityRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.get(
    "/admin/identity/non-acharyan",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
        return;
      }

      const where = {
        registrationType: "NON_ACHARYAN_STUDENT" as const,
        ...(parsed.data.status ? { status: parsed.data.status } : {})
      };

      const [items, total] = await Promise.all([
        prisma.registration.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            collegeName: true,
            publicCode: true,
            status: true,
            identityStatus: true,
            createdAt: true
          }
        }),
        prisma.registration.count({ where })
      ]);

      res.status(200).json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
    }
  );

  router.get(
    "/admin/identity/non-acharyan/:id",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const id = stringParam(req.params.id);
      const registration = id
        ? await prisma.registration.findFirst({
            where: { id, registrationType: "NON_ACHARYAN_STUDENT" },
            include: { payment: true }
          })
        : null;

      if (!registration) {
        sendError(req, res, 404, "NOT_FOUND", "Registration not found");
        return;
      }

      const [photoUrl, aadhaarImageUrl, collegeIdImageUrl] = await Promise.all([
        presignIfPresent(env, registration.photoObjectKey),
        presignIfPresent(env, registration.aadhaarImageObjectKey),
        presignIfPresent(env, registration.collegeIdImageObjectKey)
      ]);

      res.status(200).json({
        id: registration.id,
        name: registration.name,
        email: registration.email,
        phone: registration.phone,
        collegeName: registration.collegeName,
        publicCode: registration.publicCode,
        status: registration.status,
        identityStatus: registration.identityStatus,
        identityRejectionReason: registration.identityRejectionReason,
        aadhaarNumber: registration.aadhaarNumber,
        photoUrl,
        aadhaarImageUrl,
        collegeIdImageUrl,
        payment: registration.payment
          ? {
              transactionId: registration.payment.transactionId,
              status: registration.payment.status,
              submittedAt: registration.payment.submittedAt
            }
          : null
      });
    }
  );

  router.post(
    "/admin/identity/non-acharyan/:id/approve",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const id = stringParam(req.params.id);
      if (!id || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
        return;
      }

      try {
        await approveIdentity(prisma, id, req.authUser.id, req.id !== undefined ? String(req.id) : null);
        res.status(200).json({ identityStatus: "APPROVED" });
      } catch (error) {
        if (error instanceof IdentityNotReviewableError) {
          sendError(req, res, 409, "NOT_REVIEWABLE", "Identity is not in a state that can be approved");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/admin/identity/non-acharyan/:id/reject",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = rejectSchema.safeParse(req.body);
      const id = stringParam(req.params.id);
      if (!parsed.success || !id || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "A rejection reason is required", parsed.error?.flatten());
        return;
      }

      try {
        await rejectIdentity(prisma, id, req.authUser.id, parsed.data.reason, req.id !== undefined ? String(req.id) : null);
        res.status(200).json({ identityStatus: "REJECTED" });
      } catch (error) {
        if (error instanceof IdentityNotReviewableError) {
          sendError(req, res, 409, "NOT_REVIEWABLE", "Identity is not in a state that can be rejected");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
