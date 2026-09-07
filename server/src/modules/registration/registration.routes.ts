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
  createRegistration,
  DuplicateAadhaarError,
  DuplicateAuidError,
  DuplicateEmailError,
  DuplicateEmployeeIdError,
  DuplicatePhoneError,
  getRegistrationByPublicCode,
  RegistrationClosedError
} from "./registration.service.js";
import { registrationSchema } from "./registration.schemas.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { validateUploadedImage, ImageValidationError } from "../../lib/r2/validate-image.js";
import type { Env } from "../../app/config/env.js";

const photoBindSchema = z.object({
  objectKey: z.string().min(1)
});

const IMAGE_BIND_PURPOSES = {
  photo: { purpose: "PARTICIPANT_PHOTO", field: "photoObjectKey", requireSquare: true },
  "aadhaar-image": { purpose: "AADHAAR_IMAGE", field: "aadhaarImageObjectKey", requireSquare: false },
  "college-id-image": { purpose: "COLLEGE_ID_IMAGE", field: "collegeIdImageObjectKey", requireSquare: false }
} as const;

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
        data: parsed.data,
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
      if (error instanceof DuplicateAuidError) {
        sendError(
          req,
          res,
          409,
          "DUPLICATE_AUID",
          "This AUID is locked to another registration. If that one is incomplete and yours, it clears automatically within a few minutes — try again shortly."
        );
        return;
      }
      if (error instanceof DuplicateEmployeeIdError) {
        sendError(
          req,
          res,
          409,
          "DUPLICATE_EMPLOYEE_ID",
          "This Employee ID is locked to another registration. If that one is incomplete and yours, it clears automatically within a few minutes — try again shortly."
        );
        return;
      }
      if (error instanceof DuplicateAadhaarError) {
        sendError(
          req,
          res,
          409,
          "DUPLICATE_AADHAAR",
          "This Aadhaar number is locked to another registration. If that one is incomplete and yours, it clears automatically within a few minutes — try again shortly."
        );
        return;
      }
      if (error instanceof DuplicatePhoneError) {
        sendError(
          req,
          res,
          409,
          "DUPLICATE_PHONE",
          "This phone number is locked to another registration. If that one is incomplete and yours, it clears automatically within a few minutes — try again shortly."
        );
        return;
      }
      if (error instanceof DuplicateEmailError) {
        sendError(
          req,
          res,
          409,
          "DUPLICATE_EMAIL",
          "This email address is locked to another registration. If that one is incomplete and yours, it clears automatically within a few minutes — try again shortly."
        );
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
      rejectionReason: payment?.rejectionReason ?? registration.identityRejectionReason ?? null
    });
  });

  for (const [path, config] of Object.entries(IMAGE_BIND_PURPOSES)) {
    router.patch(`/registrations/:id/${path}`, uploadPresignRateLimiter, async (req, res) => {
      const parsed = photoBindSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(req, res, 400, "VALIDATION_ERROR", "Invalid image binding payload", parsed.error.flatten());
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
        intent.purpose !== config.purpose ||
        intent.consumedAt ||
        intent.expiresAt.getTime() < Date.now()
      ) {
        sendError(req, res, 400, "INVALID_UPLOAD_INTENT", "Upload intent is invalid, expired, or already used");
        return;
      }

      try {
        const client = getR2Client(env);
        await validateUploadedImage(client, env.R2_BUCKET_NAME, intent.objectKey, intent.maxSizeBytes, {
          requireSquareAspectRatio: config.requireSquare
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
          data: { [config.field]: intent.objectKey }
        })
      ]);

      res.status(200).json({ [config.field]: intent.objectKey });
    });
  }

  return router;
}
