import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { stringParam } from "../../app/middleware/params.js";
import {
  publicLookupRateLimiter,
  registrationRateLimiter,
  uploadPresignRateLimiter
} from "../../lib/security/rate-limit.js";
import {
  CapacityExceededError,
  createRegistration,
  getRegistrationByPublicCode,
  RegistrationClosedError
} from "./registration.service.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { validateUploadedImage, ImageValidationError } from "../../lib/r2/validate-image.js";
import type { Env } from "../../app/config/env.js";

const ACHARYA_EMAIL_DOMAIN = "@acharya.ac.in";

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s]{7,15}$/, "Invalid phone number"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .refine((value) => value.endsWith(ACHARYA_EMAIL_DOMAIN), {
      message: `Only ${ACHARYA_EMAIL_DOMAIN} college email addresses are eligible to register`
    }),
  college: z.string().trim().min(2).max(200),
  semester: z.string().trim().min(1).max(20),
  branch: z.string().trim().min(2).max(100)
});

const photoBindSchema = z.object({
  objectKey: z.string().min(1)
});

export function createRegistrationRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();

  router.post("/registrations", registrationRateLimiter, async (req, res) => {
    const idempotencyKey = req.header("idempotency-key");
    if (!idempotencyKey) {
      sendError(req, res, 400, "MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required");
      return;
    }

    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid registration payload", parsed.error.flatten());
      return;
    }

    try {
      const registration = await createRegistration(prisma, env.EVENT_ID, {
        ...parsed.data,
        idempotencyKey
      });

      res.status(201).json({
        registrationId: registration.id,
        publicCode: registration.publicCode,
        eightDigitCode: registration.eightDigitCode,
        status: registration.status
      });
    } catch (error) {
      if (error instanceof RegistrationClosedError) {
        sendError(req, res, 409, "REGISTRATION_CLOSED", "Registration is currently closed");
        return;
      }
      if (error instanceof CapacityExceededError) {
        sendError(req, res, 409, "CAPACITY_EXCEEDED", "Event capacity has been reached");
        return;
      }
      throw error;
    }
  });

  router.get("/registrations/status/:code", publicLookupRateLimiter, async (req, res) => {
    const registration = await getRegistrationByPublicCode(prisma, stringParam(req.params.code) ?? "");

    if (!registration) {
      sendError(req, res, 404, "NOT_FOUND", "No registration found for that code");
      return;
    }

    const payment = await prisma.payment.findUnique({ where: { registrationId: registration.id } });

    res.status(200).json({
      publicCode: registration.publicCode,
      name: registration.name,
      status: registration.status,
      paymentStatus: payment?.status ?? null,
      rejectionReason: payment?.rejectionReason ?? null
    });
  });

  router.patch("/registrations/:id/photo", uploadPresignRateLimiter, async (req, res) => {
    const parsed = photoBindSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid photo binding payload", parsed.error.flatten());
      return;
    }

    const registrationId = stringParam(req.params.id);
    if (!registrationId) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Missing registration id");
      return;
    }

    const intent = await prisma.uploadIntent.findUnique({
      where: { objectKey: parsed.data.objectKey }
    });

    if (
      !intent ||
      intent.registrationId !== registrationId ||
      intent.purpose !== "PARTICIPANT_PHOTO" ||
      intent.consumedAt ||
      intent.expiresAt.getTime() < Date.now()
    ) {
      sendError(req, res, 400, "INVALID_UPLOAD_INTENT", "Upload intent is invalid, expired, or already used");
      return;
    }

    try {
      const client = getR2Client(env);
      await validateUploadedImage(client, env.R2_BUCKET_NAME, intent.objectKey, intent.maxSizeBytes, {
        requireSquareAspectRatio: true
      });
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

    await prisma.$transaction([
      prisma.uploadIntent.update({
        where: { id: intent.id },
        data: { consumedAt: new Date() }
      }),
      prisma.registration.update({
        where: { id: registrationId },
        data: { photoObjectKey: intent.objectKey }
      })
    ]);

    res.status(200).json({ photoObjectKey: intent.objectKey });
  });

  return router;
}
