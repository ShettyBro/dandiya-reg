import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import { paymentSubmitRateLimiter } from "../../lib/security/rate-limit.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { requireActiveUser } from "../auth/require-active-user.middleware.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { presignGetUrl } from "../../lib/r2/presign.js";
import { validateUploadedImage, ImageValidationError } from "../../lib/r2/validate-image.js";
import { MAX_UPLOAD_SIZE_BYTES } from "../../lib/r2/object-keys.js";
import {
  approvePayment,
  DuplicateTransactionIdError,
  IdentityNotApprovedError,
  InvalidUploadIntentError,
  PaymentNotFoundError,
  PaymentNotInReviewableStateError,
  PaymentNotSubmittableError,
  rejectPayment,
  submitPaymentProof
} from "./payment.service.js";
import type { Env } from "../../app/config/env.js";

const submitPaymentSchema = z.object({
  transactionId: z.string().trim().min(3).max(120),
  proofObjectKey: z.string().min(1)
});

const rejectSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const listQuerySchema = z.object({
  status: z.enum(["PENDING", "PROOF_SUBMITTED", "APPROVED", "REJECTED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20)
});

export function createPaymentRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post("/registrations/:id/payment", paymentSubmitRateLimiter, async (req, res) => {
    const parsed = submitPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid payment payload", parsed.error.flatten());
      return;
    }

    const registrationId = stringParam(req.params.id);
    if (!registrationId) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
      return;
    }

    try {
      const client = getR2Client(env);
      await validateUploadedImage(client, env.R2_BUCKET_NAME, parsed.data.proofObjectKey, MAX_UPLOAD_SIZE_BYTES);
    } catch (error) {
      if (error instanceof R2NotConfiguredError) {
        sendError(req, res, 503, "R2_NOT_CONFIGURED", "Object storage is not configured yet");
        return;
      }
      if (error instanceof ImageValidationError) {
        sendError(req, res, 422, "IMAGE_VALIDATION_FAILED", error.message);
        return;
      }
      throw error;
    }

    try {
      const payment = await submitPaymentProof(prisma, {
        registrationId,
        transactionId: parsed.data.transactionId,
        proofObjectKey: parsed.data.proofObjectKey
      });
      res.status(200).json({ status: payment.status, submittedAt: payment.submittedAt });
    } catch (error) {
      if (error instanceof PaymentNotFoundError) {
        sendError(req, res, 404, "NOT_FOUND", "No payment record for this registration");
        return;
      }
      if (error instanceof PaymentNotSubmittableError) {
        sendError(req, res, 409, "PAYMENT_ALREADY_APPROVED", "This payment has already been approved");
        return;
      }
      if (error instanceof InvalidUploadIntentError) {
        sendError(req, res, 400, "INVALID_UPLOAD_INTENT", "Upload intent is invalid, expired, or already used");
        return;
      }
      if (error instanceof DuplicateTransactionIdError) {
        sendError(req, res, 409, "DUPLICATE_TRANSACTION_ID", "This transaction ID has already been used");
        return;
      }
      throw error;
    }
  });

  router.get(
    "/admin/payments",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid query", parsed.error.flatten());
        return;
      }

      const where = parsed.data.status ? { status: parsed.data.status } : {};
      const [items, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          orderBy: { submittedAt: "asc" },
          skip: (parsed.data.page - 1) * parsed.data.pageSize,
          take: parsed.data.pageSize,
          include: {
            registration: {
              select: {
                name: true,
                publicCode: true,
                email: true,
                registrationType: true,
                identityStatus: true,
                emailJobs: {
                  select: {
                    type: true,
                    status: true,
                    attempts: true,
                    sentAt: true,
                    lastError: true,
                    createdAt: true
                  },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          }
        }),
        prisma.payment.count({ where })
      ]);

      res.status(200).json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
    }
  );

  router.get(
    "/admin/payments/:id/proof-url",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const paymentId = stringParam(req.params.id);
      const payment = paymentId
        ? await prisma.payment.findUnique({ where: { id: paymentId } })
        : null;
      if (!payment || !payment.proofObjectKey) {
        sendError(req, res, 404, "NOT_FOUND", "No proof object available for this payment");
        return;
      }

      try {
        const client = getR2Client(env);
        const url = await presignGetUrl(
          client,
          env.R2_BUCKET_NAME,
          payment.proofObjectKey,
          env.R2_PRESIGN_READ_TTL
        );
        res.status(200).json({ url, expiresInSeconds: env.R2_PRESIGN_READ_TTL });
      } catch (error) {
        if (error instanceof R2NotConfiguredError) {
          sendError(req, res, 503, "R2_NOT_CONFIGURED", "Object storage is not configured yet");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/admin/payments/:id/approve",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const paymentId = stringParam(req.params.id);
      if (!paymentId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing payment id");
        return;
      }

      try {
        await approvePayment(
          prisma,
          env,
          paymentId,
          req.authUser.id,
          req.id !== undefined ? String(req.id) : null
        );
        res.status(200).json({ status: "APPROVED" });
      } catch (error) {
        if (error instanceof PaymentNotInReviewableStateError) {
          sendError(req, res, 409, "NOT_REVIEWABLE", "Payment is not in a state that can be approved");
          return;
        }
        if (error instanceof IdentityNotApprovedError) {
          sendError(req, res, 409, "IDENTITY_NOT_APPROVED", "Identity must be approved before payment can be reviewed");
          return;
        }
        throw error;
      }
    }
  );

  router.post(
    "/admin/payments/:id/reject",
    requireAuth(env),
    requireRole("ADMIN", "FINANCE"),
    requireActiveUser(prisma),
    async (req, res) => {
      const parsed = rejectSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "A rejection reason is required", parsed.error.flatten());
        return;
      }

      const paymentId = stringParam(req.params.id);
      if (!paymentId || !req.authUser) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Missing payment id");
        return;
      }

      try {
        await rejectPayment(
          prisma,
          paymentId,
          req.authUser.id,
          parsed.data.reason,
          req.id !== undefined ? String(req.id) : null
        );
        res.status(200).json({ status: "REJECTED" });
      } catch (error) {
        if (error instanceof PaymentNotInReviewableStateError) {
          sendError(req, res, 409, "NOT_REVIEWABLE", "Payment is not in a state that can be rejected");
          return;
        }
        if (error instanceof IdentityNotApprovedError) {
          sendError(req, res, 409, "IDENTITY_NOT_APPROVED", "Identity must be approved before payment can be reviewed");
          return;
        }
        throw error;
      }
    }
  );

  return router;
}
